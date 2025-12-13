import { GoogleGenAI, FunctionDeclaration, Type, Chat, GenerateContentResponse, Part } from '@google/genai';
import { Ticket } from '../types';

const searchRoutesTool: FunctionDeclaration = {
  name: 'searchRoutes',
  description: 'Search for available bus routes.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      origin: { type: Type.STRING },
      destination: { type: Type.STRING },
    },
    required: ['origin', 'destination'],
  },
};

const initiatePaymentTool: FunctionDeclaration = {
  name: 'initiatePayment',
  description: 'Initiate M-Pesa STK Push. Returns a CheckoutRequestID which MUST be stored to verify payment later.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      phoneNumber: { type: Type.STRING, description: 'Format: 0712345678' },
      amount: { type: Type.NUMBER },
    },
    required: ['phoneNumber', 'amount'],
  },
};

const verifyPaymentTool: FunctionDeclaration = {
  name: 'verifyPayment',
  description: 'Check the status of a specific payment transaction. Call this after the user says they have entered their PIN.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      checkoutRequestId: { type: Type.STRING, description: 'The ID returned by initiatePayment' },
    },
    required: ['checkoutRequestId'],
  },
};

const bookTicketTool: FunctionDeclaration = {
  name: 'bookTicket',
  description: 'Generate a SECURE ticket. ONLY Call this if verifyPayment returns "COMPLETED".',
  parameters: {
    type: Type.OBJECT,
    properties: {
      passengerName: { type: Type.STRING },
      routeId: { type: Type.STRING },
      phoneNumber: { type: Type.STRING },
    },
    required: ['passengerName', 'routeId', 'phoneNumber'],
  },
};

const logComplaintTool: FunctionDeclaration = {
  name: 'logComplaint',
  description: 'Log a customer complaint.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      issue: { type: Type.STRING },
      severity: { type: Type.STRING, enum: ['low', 'medium', 'high'] },
      customerName: { type: Type.STRING },
    },
    required: ['issue', 'severity', 'customerName'],
  },
};

const trackBusTool: FunctionDeclaration = {
  name: 'trackBus',
  description: 'Get the current location and status of a bus.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      query: { type: Type.STRING },
    },
    required: ['query'],
  },
};

export class GeminiService {
  private ai: GoogleGenAI;
  private chat: Chat;
  // We need to keep track of context ID across turns if possible, but Gemini manages context window.
  // However, simple variables like checkoutRequestId need to be remembered by the model's context window.

  constructor(apiKey: string) {
    this.ai = new GoogleGenAI({ apiKey });
    this.chat = this.ai.chats.create({
      model: 'gemini-2.5-flash',
      config: {
        systemInstruction: `You are a Professional Booking Agent for Ena Coach.

        SECURITY PROTOCOL (M-PESA):
        1. When user accepts price, ask for Phone Number.
        2. Call 'initiatePayment(phone, amount)'. 
        3. OUTPUT: "I have sent a payment request to [Phone]. Please enter your PIN to confirm."
        4. **STOP** and wait for the user to reply (e.g., "Done", "I paid").
        5. When user confirms, Call 'verifyPayment(checkoutRequestId)'.
           - Note: You must remember the 'checkoutRequestId' from step 2's output.
        6. IF 'verifyPayment' says 'COMPLETED':
           - Call 'bookTicket'.
           - Output: "Payment received! Here is your secure ticket."
        7. IF 'verifyPayment' says 'PENDING':
           - Output: "The system is still waiting for confirmation. Have you entered your PIN? Let me check again in a moment."
        8. IF 'verifyPayment' says 'FAILED':
           - Output: "The payment failed (Reason: [Reason]). Would you like to try again?"

        NEVER issue a ticket without 'verifyPayment' returning COMPLETED status.
        `,
        tools: [{
          functionDeclarations: [searchRoutesTool, initiatePaymentTool, verifyPaymentTool, bookTicketTool, logComplaintTool, trackBusTool]
        }]
      }
    });
  }

  async sendMessage(
    message: string, 
    functions: {
      searchRoutes: any,
      initiatePayment: any, // Changed from processPayment
      verifyPayment: any,   // New
      bookTicket: any,
      logComplaint: any,
      getBusStatus: any
    }
  ): Promise<{ text: string, ticket?: Ticket }> {
    try {
      const now = new Date().toLocaleString('en-KE', { timeZone: 'Africa/Nairobi' });
      const contextualMessage = `[SYSTEM CONTEXT: Current Date & Time is ${now}]\nUser: ${message}`;

      let response: GenerateContentResponse = await this.chat.sendMessage({ message: contextualMessage });
      let bookedTicket: Ticket | undefined;
      
      let loops = 0;
      while (response.functionCalls && response.functionCalls.length > 0 && loops < 5) {
        loops++;
        const parts: Part[] = [];

        for (const call of response.functionCalls) {
          const { name, args, id } = call;
          let functionResponse;
          console.log(`[Gemini] Calling tool: ${name}`, args);

          if (name === 'searchRoutes') {
            functionResponse = functions.searchRoutes(args.origin, args.destination);
          } else if (name === 'initiatePayment') {
             // New Flow
             const res = await functions.initiatePayment(args.phoneNumber, args.amount);
             functionResponse = res; // Should contain checkoutRequestId
          } else if (name === 'verifyPayment') {
             // New Flow
             const res = await functions.verifyPayment(args.checkoutRequestId);
             functionResponse = res;
          } else if (name === 'bookTicket') {
            const ticket = functions.bookTicket(args.passengerName, args.routeId, args.phoneNumber);
            if (ticket) {
                bookedTicket = ticket;
                functionResponse = { 
                    ...ticket, 
                    status: 'success',
                    message: "Secure Ticket Generated."
                };
            } else {
                functionResponse = { error: "Booking failed." };
            }
          } else if (name === 'logComplaint') {
            const complaintId = functions.logComplaint(args.customerName, args.issue, args.severity);
            functionResponse = { complaintId, status: 'logged' };
          } else if (name === 'trackBus') {
            const status = await functions.getBusStatus(args.query);
            functionResponse = status || { error: "Bus not found." };
          } else {
              functionResponse = { error: "Unknown function" };
          }

          parts.push({
              functionResponse: {
                  name: name,
                  response: { result: functionResponse },
                  id: id 
              }
          });
        }

        if (parts.length > 0) {
            response = await this.chat.sendMessage({ message: parts });
        }
      }

      return { 
        text: response.text || "I didn't have a response to that.",
        ticket: bookedTicket
      };

    } catch (error) {
      console.error("Gemini Error:", error);
      return { text: "Sorry, I lost connection. Can you repeat that?" };
    }
  }
}
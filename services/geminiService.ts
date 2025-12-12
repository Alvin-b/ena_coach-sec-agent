import { GoogleGenAI, FunctionDeclaration, Type, Chat, GenerateContentResponse, Part } from '@google/genai';
import { Ticket } from '../types';

// We define the tool schema here so the AI knows how to call our mock backend.

const searchRoutesTool: FunctionDeclaration = {
  name: 'searchRoutes',
  description: 'Search for available bus routes. Returns buses that travel between or THROUGH the requested cities.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      origin: { type: Type.STRING, description: 'The starting city' },
      destination: { type: Type.STRING, description: 'The destination city' },
    },
    required: ['origin', 'destination'],
  },
};

const bookTicketTool: FunctionDeclaration = {
  name: 'bookTicket',
  description: 'Book a ticket for a passenger after payment is confirmed. Returns the ticket details.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      passengerName: { type: Type.STRING, description: 'Name of the passenger' },
      routeId: { type: Type.STRING, description: 'The ID of the route to book' },
      phoneNumber: { type: Type.STRING, description: 'Customer phone number for the ticket' },
    },
    required: ['passengerName', 'routeId', 'phoneNumber'],
  },
};

const processPaymentTool: FunctionDeclaration = {
  name: 'processPayment',
  description: 'Initiate an M-Pesa payment request (Daraja STK Push). Returns success or failure.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      phoneNumber: { type: Type.STRING, description: 'The phone number to bill' },
      amount: { type: Type.NUMBER, description: 'The amount to charge in KES' },
    },
    required: ['phoneNumber', 'amount'],
  },
};

const logComplaintTool: FunctionDeclaration = {
  name: 'logComplaint',
  description: 'Log a customer complaint. Use this ONLY after getting route and date details.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      issue: { type: Type.STRING, description: 'Description of the complaint including Route and Date' },
      severity: { type: Type.STRING, enum: ['low', 'medium', 'high'], description: 'Severity level' },
      customerName: { type: Type.STRING, description: 'Name of the customer' },
    },
    required: ['issue', 'severity', 'customerName'],
  },
};

const trackBusTool: FunctionDeclaration = {
  name: 'trackBus',
  description: 'Get the current location and status of a bus using a Route ID or Ticket ID.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      query: { type: Type.STRING, description: 'The Route ID (e.g., R001) or Ticket ID (e.g., TKT-1234)' },
    },
    required: ['query'],
  },
};

export class GeminiService {
  private ai: GoogleGenAI;
  private chat: Chat;

  constructor(apiKey: string) {
    this.ai = new GoogleGenAI({ apiKey });
    this.chat = this.ai.chats.create({
      model: 'gemini-2.5-flash',
      config: {
        systemInstruction: `You are a human Customer Care Representative at Ena Coach. 
        
        CRITICAL PERSONALITY RULES:
        1. IDENTITY: You are a REAL PERSON working at the Ena Coach office. NEVER say you are an AI, bot, or assistant.
        2. TONE: Be empathetic, professional, yet casual like a WhatsApp text.
        3. FORMATTING: PURE TEXT ONLY. Do NOT use markdown.
        
        STRICT ROUTE KNOWLEDGE:
        - ONLY recommend routes returned by the 'searchRoutes' tool.
        - If 'searchRoutes' returns an empty list or says no bus found, YOU MUST tell the user "We do not have a bus for that route yet."
        - DO NOT HALLUCINATE ROUTES. Do not make up departure times.

        BOOKING PROCESS (CRITICAL):
        1. Search for the route first. Confirm the price and time with the user.
        2. Ask for their Name and Phone Number.
        3. Call 'processPayment'. 
        4. **IMMEDIATELY** after 'processPayment' returns 'success', you MUST call 'bookTicket' in the SAME turn.
        - DO NOT stop and ask "Did you receive the prompt?".
        - DO NOT wait for the user.
        - The flow is: Process Payment -> (Success) -> Book Ticket -> Show Ticket.

        COMPLAINTS:
        - Sympathize first.
        - Ask for Route and Date.
        - Call logComplaint.
        - Confirm follow-up.

        Route Info:
        - Routes are ALWAYS two-way.`,
        tools: [{
          functionDeclarations: [searchRoutesTool, bookTicketTool, processPaymentTool, logComplaintTool, trackBusTool]
        }]
      }
    });
  }

  // Wrapper to handle the chat and function execution loop
  async sendMessage(
    message: string, 
    functions: {
      searchRoutes: any,
      bookTicket: any,
      processPayment: any,
      logComplaint: any,
      getBusStatus: any
    }
  ): Promise<{ text: string, ticket?: Ticket }> {
    try {
      let response: GenerateContentResponse = await this.chat.sendMessage({ message });
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
          } else if (name === 'bookTicket') {
            const ticket = functions.bookTicket(args.passengerName, args.routeId, args.phoneNumber);
            if (ticket) {
                // Success
                bookedTicket = ticket;
                functionResponse = { 
                    ...ticket, 
                    status: 'success',
                    message: "Ticket booked successfully."
                };
            } else {
                functionResponse = { error: "Booking failed. Route full or invalid." };
            }
          } else if (name === 'processPayment') {
            const success = await functions.processPayment(args.phoneNumber, args.amount);
            // Hinting the model to proceed
            functionResponse = { 
              status: success ? 'success' : 'failed', 
              message: success ? 'Payment successful. PROCEED TO BOOK TICKET IMMEDIATELY.' : 'Payment failed.' 
            };
          } else if (name === 'logComplaint') {
            const complaintId = functions.logComplaint(args.customerName, args.issue, args.severity);
            functionResponse = { complaintId, status: 'logged' };
          } else if (name === 'trackBus') {
            const status = functions.getBusStatus(args.query);
            if (status) {
              functionResponse = status;
            } else {
              functionResponse = { error: "Bus not found." };
            }
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
      return { text: "Sorry, network's a bit slow. Try again?" };
    }
  }
}
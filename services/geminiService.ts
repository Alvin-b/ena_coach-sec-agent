import { GoogleGenAI, FunctionDeclaration, Type, Chat, GenerateContentResponse, Part } from '@google/genai';

// We define the tool schema here so the AI knows how to call our mock backend.

const searchRoutesTool: FunctionDeclaration = {
  name: 'searchRoutes',
  description: 'Search for available bus routes between two cities.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      origin: { type: Type.STRING, description: 'The starting city (e.g., Nairobi)' },
      destination: { type: Type.STRING, description: 'The destination city (e.g., Kisumu)' },
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
  description: 'Initiate an M-Pesa payment request (Daraja STK Push).',
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
  description: 'Log a complex customer complaint into the database for admin review.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      issue: { type: Type.STRING, description: 'Description of the complaint' },
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
        systemInstruction: `You are the digital assistant for Ena Coach, a premier bus company in Kenya. 
        Your goal is to help customers via WhatsApp.
        
        Capabilities:
        1. Search for bus routes (use searchRoutes).
        2. Book tickets (use bookTicket - ONLY after payment).
        3. Process payments via M-Pesa (use processPayment).
        4. Handle complaints. If a complaint is complex or requires human intervention, log it (use logComplaint).
        5. Track Buses: If a user asks where their bus is, ask for their Ticket ID or Route ID, then use 'trackBus'.
        
        Rules:
        - Be polite, professional, and concise.
        - Currency is always KES.
        - Before booking, YOU MUST process payment successfully.
        - After booking, provide the Ticket ID and Seat Number to the user.
        - If tracking a bus, give the location and estimated arrival in a friendly manner.
        - If a user asks generic questions (e.g., "Do you allow pets?"), answer based on general knowledge: "Small pets in carriers are usually allowed, but please check with the office."`,
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
  ): Promise<string> {
    try {
      let response: GenerateContentResponse = await this.chat.sendMessage({ message });
      
      // Handle tool calls recursively (max 5 turns to prevent infinite loops)
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
            functionResponse = functions.bookTicket(args.passengerName, args.routeId, args.phoneNumber);
            if (!functionResponse) functionResponse = { error: "Booking failed. Route full or invalid." };
          } else if (name === 'processPayment') {
            const success = await functions.processPayment(args.phoneNumber, args.amount);
            functionResponse = { status: success ? 'success' : 'failed', message: success ? 'Payment received' : 'Payment failed' };
          } else if (name === 'logComplaint') {
            const complaintId = functions.logComplaint(args.customerName, args.issue, args.severity);
            functionResponse = { complaintId, status: 'logged' };
          } else if (name === 'trackBus') {
            const status = functions.getBusStatus(args.query);
            if (status) {
              functionResponse = status;
            } else {
              functionResponse = { error: "Bus not found. Please check the Ticket ID or Route ID." };
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

        // Send tool responses back to Gemini
        if (parts.length > 0) {
            response = await this.chat.sendMessage({ message: parts });
        }
      }

      return response.text || "I didn't have a response to that.";

    } catch (error) {
      console.error("Gemini Error:", error);
      return "I'm sorry, I'm having trouble connecting to the Ena Coach network right now. Please try again.";
    }
  }
}


import { GoogleGenAI, FunctionDeclaration, Type, Chat, GenerateContentResponse, Part, HarmCategory, HarmBlockThreshold } from '@google/genai';
import { Ticket } from '../types';

// --- ADMIN DATABASE TOOLS ---
const addRouteTool: FunctionDeclaration = {
  name: 'addRoute',
  description: 'Add a new travel route to the database.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      origin: { type: Type.STRING },
      destination: { type: Type.STRING },
      departureTime: { type: Type.STRING, description: 'e.g., 08:00 AM' },
      price: { type: Type.NUMBER },
      busType: { type: Type.STRING, enum: ['Luxury', 'Standard'] }
    },
    required: ['origin', 'destination', 'departureTime', 'price', 'busType']
  }
};

const updateRouteTool: FunctionDeclaration = {
  name: 'updateRoute',
  description: 'Modify details of an existing route (price, time, etc).',
  parameters: {
    type: Type.OBJECT,
    properties: {
      routeId: { type: Type.STRING },
      price: { type: Type.NUMBER },
      departureTime: { type: Type.STRING },
      busType: { type: Type.STRING, enum: ['Luxury', 'Standard'] }
    },
    required: ['routeId']
  }
};

const deleteRouteTool: FunctionDeclaration = {
  name: 'deleteRoute',
  description: 'Permanently remove a route from the system.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      routeId: { type: Type.STRING }
    },
    required: ['routeId']
  }
};

const financialReportTool: FunctionDeclaration = {
  name: 'getFinancialReport',
  description: 'Get total revenue, ticket count, and average price stats.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      startDate: { type: Type.STRING, description: 'Optional start date YYYY-MM-DD' },
      endDate: { type: Type.STRING, description: 'Optional end date YYYY-MM-DD' }
    },
  },
};

const occupancyStatsTool: FunctionDeclaration = {
  name: 'getOccupancyStats',
  description: 'Get current fleet utilization percentages and capacity data.',
  parameters: {
    type: Type.OBJECT,
    properties: {},
  },
};

const getComplaintsTool: FunctionDeclaration = {
    name: 'getComplaints',
    description: 'Get a list of customer complaints to summarize or review.',
    parameters: {
        type: Type.OBJECT,
        properties: {
            status: { type: Type.STRING, enum: ['open', 'resolved'] }
        }
    }
};

const resolveComplaintTool: FunctionDeclaration = {
    name: 'resolveComplaint',
    description: 'Resolve a complaint and optionally send a resolution message to the customer.',
    parameters: {
        type: Type.OBJECT,
        properties: {
            complaintId: { type: Type.STRING },
            resolutionMessage: { type: Type.STRING }
        },
        required: ['complaintId', 'resolutionMessage']
    }
};

// --- CUSTOMER TOOLS ---
const searchRoutesTool: FunctionDeclaration = {
  name: 'searchRoutes',
  description: 'Search for available bus routes.',
  parameters: {
    type: Type.OBJECT,
    properties: { origin: { type: Type.STRING }, destination: { type: Type.STRING } },
    required: ['origin', 'destination'],
  },
};

const initiatePaymentTool: FunctionDeclaration = {
  name: 'initiatePayment',
  description: 'Triggers an M-Pesa STK Push. Use this when the user chooses a route and is ready to pay.',
  parameters: {
    type: Type.OBJECT,
    properties: {
        phoneNumber: { type: Type.STRING, description: 'Customer phone number for M-Pesa push' },
        amount: { type: Type.NUMBER, description: 'Ticket price' }
    },
    required: ['phoneNumber', 'amount'],
  },
};

const bookTicketTool: FunctionDeclaration = {
  name: 'bookTicket',
  description: 'Finalizes the booking and generates a ticket. Call this ONLY after payment confirmation or if user is ready.',
  parameters: {
    type: Type.OBJECT,
    properties: {
        passengerName: { type: Type.STRING },
        routeId: { type: Type.STRING },
        phoneNumber: { type: Type.STRING }
    },
    required: ['passengerName', 'routeId', 'phoneNumber'],
  },
};

export class GeminiService {
  private ai: GoogleGenAI;
  private customerChat: Chat;
  private adminChat: Chat;

  constructor(apiKey: string) {
    this.ai = new GoogleGenAI({ apiKey });
    const safetySettings = [{ category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE }];

    this.customerChat = this.ai.chats.create({
      model: 'gemini-3-flash-preview',
      config: {
        safetySettings,
        systemInstruction: `You are Martha, the friendly Ena Coach AI Assistant. 
        - Assist users with booking bus tickets.
        - You can search for routes, initiate M-Pesa payments, and finalize bookings.
        - When a user selects a route, use 'initiatePayment'. 
        - Once payment is verified (or for testing), use 'bookTicket'.
        - Keep responses concise and helpful for a chat interface.`,
        tools: [{ functionDeclarations: [searchRoutesTool, initiatePaymentTool, bookTicketTool] }]
      }
    });

    this.adminChat = this.ai.chats.create({
        model: 'gemini-3-flash-preview',
        config: {
            safetySettings,
            systemInstruction: `You are the Intelligent Operations Manager for Ena Coach. 
            You have full authority to MANIPULATE THE DATABASE. 
            - You can create new routes if we expand.
            - You can update prices (e.g., 'increase all Kisumu prices by 200 for the holiday').
            - You can delete cancelled or retired routes.
            Be decisive and professional.`,
            tools: [{
                functionDeclarations: [
                    financialReportTool, 
                    occupancyStatsTool, 
                    addRouteTool, 
                    updateRouteTool, 
                    deleteRouteTool,
                    getComplaintsTool,
                    resolveComplaintTool
                ]
            }]
        }
    });
  }

  async sendAdminMessage(
    message: string,
    functions: {
        getFinancialReport: any,
        getOccupancyStats: any,
        addRoute: any,
        updateRoute: any,
        deleteRoute: any,
        getComplaints: any,
        resolveComplaint: any
    }
  ): Promise<string> {
      try {
        let response = await this.adminChat.sendMessage({ message: `[SYSTEM TIME: ${new Date().toLocaleString()}]\nAdmin Request: ${message}` });
        let loops = 0;

        while (response.functionCalls && response.functionCalls.length > 0 && loops < 5) {
            loops++;
            const parts: Part[] = [];
            
            for (const call of response.functionCalls) {
                const { name, args, id } = call;
                let functionResponse;

                if (name === 'getFinancialReport') functionResponse = functions.getFinancialReport();
                else if (name === 'getOccupancyStats') functionResponse = functions.getOccupancyStats();
                else if (name === 'addRoute') {
                    const success = await functions.addRoute(args);
                    functionResponse = { status: success ? 'success' : 'failed' };
                }
                else if (name === 'updateRoute') {
                    const { routeId, ...updates } = args as any;
                    const success = await functions.updateRoute(routeId, updates);
                    functionResponse = { status: success ? 'success' : 'failed' };
                }
                else if (name === 'deleteRoute') {
                    const success = await functions.deleteRoute((args as any).routeId);
                    functionResponse = { status: success ? 'success' : 'failed' };
                }
                else if (name === 'getComplaints') functionResponse = functions.getComplaints();
                else if (name === 'resolveComplaint') functionResponse = await functions.resolveComplaint(args.complaintId, args.resolutionMessage);

                parts.push({ functionResponse: { name, response: { result: functionResponse }, id } });
            }
            response = await this.adminChat.sendMessage({ message: parts });
        }
        return response.text || "Command executed.";
      } catch (e) { return "Operation failed."; }
  }

  async sendMessage(
    msg: string, 
    functions: any, 
    onPaymentInit?: (checkoutId: string) => void
  ): Promise<{text: string, ticket?: Ticket}> {
      try {
        let response = await this.customerChat.sendMessage({ message: msg });
        let ticket: Ticket | undefined;
        let loops = 0;

        while (response.functionCalls && response.functionCalls.length > 0 && loops < 5) {
            loops++;
            const parts: Part[] = [];
            
            for (const call of response.functionCalls) {
                const { name, args, id } = call;
                let functionResponse;

                if (name === 'searchRoutes') {
                    functionResponse = await functions.searchRoutes(args.origin, args.destination);
                } else if (name === 'initiatePayment') {
                    const res = await functions.initiatePayment(args.phoneNumber, args.amount);
                    if (res.success && onPaymentInit) onPaymentInit(res.checkoutRequestId);
                    functionResponse = res;
                } else if (name === 'bookTicket') {
                    const res = await functions.bookTicket(args.passengerName, args.routeId, args.phoneNumber);
                    if (res) {
                        ticket = res;
                        // Inject a secure unique hash for the QR
                        const secureHash = btoa(`${ticket.id}-${ticket.passengerName}-${Date.now()}`).substring(0, 16);
                        ticket.qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${secureHash}`;
                        functionResponse = { status: 'success', ticketId: ticket.id };
                    } else {
                        functionResponse = { status: 'failed', message: 'Booking limit reached or route unavailable' };
                    }
                }
                
                parts.push({ functionResponse: { name, response: { result: functionResponse }, id } });
            }
            response = await this.customerChat.sendMessage({ message: parts });
        }
        return { text: response.text || "Thinking...", ticket };
      } catch (e) {
          console.error("Gemini Chat Error:", e);
          return { text: "I'm having trouble processing that right now. Could you please try again?" };
      }
  }
}

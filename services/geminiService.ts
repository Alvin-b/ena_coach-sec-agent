
import { GoogleGenAI, FunctionDeclaration, Type, Chat, GenerateContentResponse, Part, HarmCategory, HarmBlockThreshold } from '@google/genai';
import { Ticket } from '../types';

// --- CUSTOMER TOOLS ---
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
  description: 'Initiate M-Pesa STK Push. Returns a CheckoutRequestID. The system will monitor this ID automatically.',
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
  description: 'Check the status of a specific payment transaction.',
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
  description: 'Generate a SECURE ticket. ONLY Call this if verifyPayment returns "COMPLETED" or if you receive [PAYMENT_SUCCESS].',
  parameters: {
    type: Type.OBJECT,
    properties: {
      passengerName: { type: Type.STRING },
      routeId: { type: Type.STRING },
      phoneNumber: { type: Type.STRING },
      checkoutRequestId: { type: Type.STRING, description: 'The Verified Payment ID' },
    },
    required: ['passengerName', 'routeId', 'phoneNumber', 'checkoutRequestId'],
  },
};

const logComplaintTool: FunctionDeclaration = {
  name: 'logComplaint',
  description: 'Log a customer complaint. You must ask for the date/time of the incident and the route details if they are not provided.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      issue: { type: Type.STRING },
      severity: { type: Type.STRING, enum: ['low', 'medium', 'high'] },
      customerName: { type: Type.STRING },
      incidentDate: { type: Type.STRING, description: 'Date and time when the incident occurred.' },
      routeInfo: { type: Type.STRING, description: 'The bus route or number associated with the complaint.' },
    },
    required: ['issue', 'severity', 'customerName', 'incidentDate'],
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

// --- ADMIN TOOLS ---
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

const adminBroadcastTool: FunctionDeclaration = {
    name: 'broadcastMessage',
    description: 'Send a marketing message to all contacts.',
    parameters: {
        type: Type.OBJECT,
        properties: {
            message: { type: Type.STRING },
            confirm: { type: Type.BOOLEAN, description: 'Must be true to send' }
        },
        required: ['message', 'confirm']
    }
};

const getManifestTool: FunctionDeclaration = {
    name: 'getRouteManifest',
    description: 'Get a list of passengers for a specific route and date.',
    parameters: {
        type: Type.OBJECT,
        properties: {
            routeId: { type: Type.STRING },
            date: { type: Type.STRING, description: 'YYYY-MM-DD' }
        },
        required: ['routeId', 'date']
    }
};

const getComplaintsTool: FunctionDeclaration = {
    name: 'getComplaints',
    description: 'Get a list of customer complaints to summarize or review.',
    parameters: {
        type: Type.OBJECT,
        properties: {
            status: { type: Type.STRING, enum: ['open', 'resolved'], description: 'Optional filter' }
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
            resolutionMessage: { type: Type.STRING, description: 'The message to send to the customer about the resolution.' }
        },
        required: ['complaintId', 'resolutionMessage']
    }
};

export class GeminiService {
  private ai: GoogleGenAI;
  private customerChat: Chat;
  private adminChat: Chat;

  constructor(apiKey: string) {
    if (!apiKey) console.warn("GeminiService initialized without API Key. Calls will fail.");
    this.ai = new GoogleGenAI({ apiKey });
    
    const safetySettings = [
      { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
      { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
      { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
      { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
    ];

    // 1. Customer Chat Instance
    this.customerChat = this.ai.chats.create({
      model: 'gemini-2.5-flash',
      config: {
        safetySettings,
        systemInstruction: `You are Martha, the friendly AI Assistant for Ena Coach. 
  
        **BEHAVIOR:**
        - Wait for the user to speak first. Do not introduce yourself unless asked.
        - Be reactive and helpful.
        - **PROACTIVE PAYMENT MONITORING:**
          - When you initiate a payment, tell the user: "I've sent an M-Pesa prompt to your phone. Please enter your PIN. I'll automatically detect the payment once it's complete."
          - **NEVER** ask the user to "let me know" or "tell me when finished".
          - If you receive a message containing "[PAYMENT_SUCCESS]", immediately call 'bookTicket' to generate the ticket using the stored CheckoutRequestID.

        **CRITICAL DATE AWARENESS:**
        Every message will start with the [SYSTEM TIME]. Use this exact date to calculate relative terms like "tomorrow".

        **Your Role:**
        1. Booking Tickets.
        2. Resolving Complaints.
        3. General Inquiries.
        
        GOLDEN RULE: ASK ONLY ONE QUESTION AT A TIME.
        `,
        tools: [{
          functionDeclarations: [searchRoutesTool, initiatePaymentTool, verifyPaymentTool, bookTicketTool, logComplaintTool, trackBusTool]
        }]
      }
    });

    // 2. Admin Chat Instance
    this.adminChat = this.ai.chats.create({
        model: 'gemini-2.5-flash',
        config: {
            safetySettings,
            systemInstruction: `You are an Intelligent Operations Manager Assistant for Ena Coach.
            **DATE AWARENESS:** Use the [SYSTEM TIME] provided in messages for all reporting. 
            TONE: Professional, concise, data-driven.`,
            tools: [{
                functionDeclarations: [
                    financialReportTool, 
                    occupancyStatsTool, 
                    adminBroadcastTool,
                    searchRoutesTool,
                    trackBusTool,
                    getManifestTool,
                    getComplaintsTool,
                    resolveComplaintTool
                ]
            }]
        }
    });
  }

  // --- CUSTOMER MESSAGE HANDLER ---
  async sendMessage(
    message: string, 
    functions: {
      searchRoutes: any,
      initiatePayment: any, 
      verifyPayment: any,  
      bookTicket: any,
      logComplaint: any,
      getBusStatus: any
    },
    onPaymentInitiated?: (checkoutRequestId: string, phoneNumber: string, amount: number) => void
  ): Promise<{ text: string, ticket?: Ticket }> {
    try {
      const now = new Date();
      const dateString = now.toLocaleDateString('en-KE', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'Africa/Nairobi' });
      const timeString = now.toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Nairobi' });
      
      const contextualMessage = `[SYSTEM TIME: ${dateString}, ${timeString}]\nUser Message: ${message}`;

      let response: GenerateContentResponse = await this.customerChat.sendMessage({ message: contextualMessage });
      let bookedTicket: Ticket | undefined;
      
      let loops = 0;
      while (response.functionCalls && response.functionCalls.length > 0 && loops < 5) {
        loops++;
        const parts: Part[] = [];

        for (const call of response.functionCalls) {
          const { name, args, id } = call;
          let functionResponse;

          if (name === 'searchRoutes') {
            const results = functions.searchRoutes(args.origin as string, args.destination as string);
            if (Array.isArray(results)) {
                functionResponse = results.map((r: any) => ({
                    id: r.id,
                    org: r.origin,
                    dst: r.destination,
                    time: r.departureTime,
                    price: r.price,
                    type: r.busType
                }));
            } else {
                functionResponse = results;
            }
          } else if (name === 'initiatePayment') {
             const res = await functions.initiatePayment(args.phoneNumber as string, args.amount as number);
             if (res.success && onPaymentInitiated) {
                 onPaymentInitiated(res.checkoutRequestId, args.phoneNumber as string, args.amount as number);
             }
             functionResponse = res; 
          } else if (name === 'verifyPayment') {
             const res = await functions.verifyPayment(args.checkoutRequestId as string);
             functionResponse = res;
          } else if (name === 'bookTicket') {
            const ticket = functions.bookTicket(
                args.passengerName as string, 
                args.routeId as string, 
                args.phoneNumber as string, 
                args.checkoutRequestId as string
            );
            if (ticket) {
                bookedTicket = ticket;
                functionResponse = { 
                    status: 'success', 
                    message: "Ticket Generated.", 
                    ticketId: ticket.id,
                    seat: ticket.seatNumber
                };
            } else {
                functionResponse = { error: "Booking failed (Server Error)." };
            }
          } else if (name === 'logComplaint') {
            const complaintId = functions.logComplaint(
                args.customerName as string, 
                args.issue as string, 
                args.severity as 'low' | 'medium' | 'high', 
                args.incidentDate as string, 
                args.routeInfo as string
            );
            functionResponse = { complaintId, status: 'logged' };
          } else if (name === 'trackBus') {
            const status = await functions.getBusStatus(args.query as string);
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
            response = await this.customerChat.sendMessage({ message: parts });
        }
      }

      return { 
        text: response.text || "Processing completed.",
        ticket: bookedTicket
      };

    } catch (error) {
      console.error("Gemini Customer Error:", error);
      return { text: "Sorry, I lost connection to the agent. Please try again." };
    }
  }

  async sendAdminMessage(
    message: string,
    functions: {
        getFinancialReport: any,
        getOccupancyStats: any,
        broadcastMessage: any,
        searchRoutes: any,
        getBusStatus: any,
        contacts: any[],
        getRouteManifest: any,
        getComplaints: any,
        resolveComplaint: any
    }
  ): Promise<string> {
      try {
        const now = new Date();
        const dateString = now.toLocaleDateString('en-KE', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'Africa/Nairobi' });
        const timeString = now.toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Nairobi' });
        
        const contextualMessage = `[SYSTEM TIME: ${dateString}, ${timeString}]\nUser Message: ${message}`;
        
        const responsePromise = this.adminChat.sendMessage({ message: contextualMessage });
        let response = await responsePromise;
        let loops = 0;

        while (response.functionCalls && response.functionCalls.length > 0 && loops < 5) {
            loops++;
            const parts: Part[] = [];
            
            for (const call of response.functionCalls) {
                const { name, args, id } = call;
                let functionResponse;

                if (name === 'getFinancialReport') {
                    functionResponse = functions.getFinancialReport(args.startDate as string, args.endDate as string);
                } else if (name === 'getOccupancyStats') {
                    functionResponse = functions.getOccupancyStats();
                } else if (name === 'broadcastMessage') {
                     if (args.confirm) {
                         const phones = functions.contacts.map((c: any) => c.phoneNumber);
                         const res = await functions.broadcastMessage(args.message as string, phones);
                         functionResponse = res;
                     } else {
                         functionResponse = { status: "pending_confirmation", message: "Please ask user to confirm." };
                     }
                } else if (name === 'searchRoutes') {
                    const results = functions.searchRoutes(args.origin as string, args.destination as string);
                    if (Array.isArray(results)) {
                        functionResponse = results.map((r: any) => ({
                            id: r.id,
                            org: r.origin,
                            dst: r.destination,
                            time: r.departureTime,
                            price: r.price
                        }));
                    } else {
                        functionResponse = results;
                    }
                } else if (name === 'trackBus') {
                    functionResponse = await functions.getBusStatus(args.query as string);
                } else if (name === 'getRouteManifest') {
                    const manifest = await functions.getRouteManifest(args.routeId as string, args.date as string);
                    if (manifest && Array.isArray(manifest.passengers)) {
                        functionResponse = {
                            total: manifest.total,
                            passengers: manifest.passengers.map((p: any) => ({ name: p.name, seat: p.seat }))
                        };
                    } else {
                        functionResponse = manifest;
                    }
                } else if (name === 'getComplaints') {
                    functionResponse = functions.getComplaints(args.status as 'open' | 'resolved' | undefined);
                } else if (name === 'resolveComplaint') {
                    functionResponse = await functions.resolveComplaint(args.complaintId as string, args.resolutionMessage as string);
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
                response = await this.adminChat.sendMessage({ message: parts });
            }
        }
        return response.text || "Processing completed.";
      } catch (error) {
          console.error("Gemini Admin Error:", error);
          return "I encountered an error processing your administrative request.";
      }
  }
}

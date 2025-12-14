import { GoogleGenAI, FunctionDeclaration, Type, Chat, GenerateContentResponse, Part } from '@google/genai';
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
    
    // Safety Settings to prevent false blocks
    const safetySettings = [
      { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
    ];

    // 1. Customer Chat Instance
    this.customerChat = this.ai.chats.create({
      model: 'gemini-2.5-flash',
      config: {
        safetySettings,
        systemInstruction: `You are a Professional Booking Agent for Ena Coach.

        **CRITICAL SECURITY & CONFIRMATION PROTOCOL**:
        1. When the user selects a route, you MUST ask for the Travel Date.
        2. Once you have the Route and Date, you MUST output a confirmation message in this exact format:
           "Just to confirm, you want to book a seat to [Destination] for [Date]. The price is [Price]. Is that correct?"
        3. DO NOT ask for a Phone Number or proceed to payment until the user answers "Yes" to the confirmation question.
        4. If the user confirms, ask for the M-Pesa Phone Number.
        5. Call 'initiatePayment(phone, amount)'. 
        6. OUTPUT: "I have sent a payment request to [Phone]. Please enter your PIN to confirm."
        7. **STOP** and wait for the user to reply (e.g., "Done", "I paid").
        8. When user confirms payment, Call 'verifyPayment(checkoutRequestId)'.
           - Note: You must remember the 'checkoutRequestId' from step 5.
        9. IF 'verifyPayment' says 'COMPLETED':
           - Call 'bookTicket(passengerName, routeId, phoneNumber, checkoutRequestId)'.
           - Output: "Payment received! Here is your secure ticket."
        10. IF 'verifyPayment' says 'PENDING' or 'FAILED', inform the user accordingly.

        NEVER issue a ticket without 'verifyPayment' returning COMPLETED status.
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
            Your role is to help the admin analyze data, manage the fleet, and make decisions.
            
            CAPABILITIES:
            1. Financials: Calculate revenue, averages, and ticket sales volume using 'getFinancialReport'.
            2. Fleet Status: Check occupancy and utilization using 'getOccupancyStats'.
            3. Manifests: To see who is traveling, use 'getRouteManifest(routeId, date)'.
            4. Marketing: Draft and send broadcast messages using 'broadcastMessage'.
            5. Customer Support: Access complaints using 'getComplaints' to summarize issues. Resolve them using 'resolveComplaint(complaintId, message)' which will update the status and notify the customer.
            6. General Query: Answer questions about routes using 'searchRoutes'.
            
            TONE: Professional, concise, data-driven. Use tables or lists for numbers.`,
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
    }
  ): Promise<{ text: string, ticket?: Ticket }> {
    try {
      const now = new Date().toLocaleString('en-KE', { timeZone: 'Africa/Nairobi' });
      const contextualMessage = `[SYSTEM CONTEXT: Current Date & Time is ${now}]\nUser: ${message}`;

      let response: GenerateContentResponse = await this.customerChat.sendMessage({ message: contextualMessage });
      let bookedTicket: Ticket | undefined;
      
      let loops = 0;
      while (response.functionCalls && response.functionCalls.length > 0 && loops < 5) {
        loops++;
        const parts: Part[] = [];

        for (const call of response.functionCalls) {
          const { name, args, id } = call;
          let functionResponse;
          console.log(`[Gemini Customer] Calling tool: ${name}`, args);

          if (name === 'searchRoutes') {
            functionResponse = functions.searchRoutes(args.origin, args.destination);
          } else if (name === 'initiatePayment') {
             const res = await functions.initiatePayment(args.phoneNumber, args.amount);
             functionResponse = res; 
          } else if (name === 'verifyPayment') {
             const res = await functions.verifyPayment(args.checkoutRequestId);
             functionResponse = res;
          } else if (name === 'bookTicket') {
            const paymentCheck = await functions.verifyPayment(args.checkoutRequestId);
            if (paymentCheck.status === 'COMPLETED') {
                const ticket = functions.bookTicket(args.passengerName, args.routeId, args.phoneNumber, args.checkoutRequestId);
                if (ticket) {
                    bookedTicket = ticket;
                    functionResponse = { ...ticket, status: 'success', message: "Secure Ticket Generated." };
                } else {
                    functionResponse = { error: "Booking failed (Server Error)." };
                }
            } else {
                 functionResponse = { error: `Payment Verification Failed. Status: ${paymentCheck.status}. Ticket denied.` };
            }
          } else if (name === 'logComplaint') {
            const complaintId = functions.logComplaint(args.customerName, args.issue, args.severity, args.incidentDate, args.routeInfo);
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
            response = await this.customerChat.sendMessage({ message: parts });
        }
      }

      return { 
        text: response.text || "I didn't have a response to that.",
        ticket: bookedTicket
      };

    } catch (error) {
      console.error("Gemini Customer Error:", error);
      // Return details to UI if it's a known error type, otherwise generic
      if (error instanceof Error && error.message.includes('API key')) {
        return { text: "Error: API Key is invalid or missing in configuration." };
      }
      return { text: "Sorry, I lost connection to the agent. Please check the console for details." };
    }
  }

  // --- ADMIN MESSAGE HANDLER ---
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
        const responsePromise = this.adminChat.sendMessage({ message });
        let response = await responsePromise;
        let loops = 0;

        while (response.functionCalls && response.functionCalls.length > 0 && loops < 5) {
            loops++;
            const parts: Part[] = [];
            
            for (const call of response.functionCalls) {
                const { name, args, id } = call;
                let functionResponse;
                console.log(`[Gemini Admin] Calling tool: ${name}`, args);

                if (name === 'getFinancialReport') {
                    functionResponse = functions.getFinancialReport(args.startDate, args.endDate);
                } else if (name === 'getOccupancyStats') {
                    functionResponse = functions.getOccupancyStats();
                } else if (name === 'broadcastMessage') {
                     if (args.confirm) {
                         const phones = functions.contacts.map((c: any) => c.phoneNumber);
                         const res = await functions.broadcastMessage(args.message, phones);
                         functionResponse = res;
                     } else {
                         functionResponse = { status: "pending_confirmation", message: "Please ask user to confirm." };
                     }
                } else if (name === 'searchRoutes') {
                    functionResponse = functions.searchRoutes(args.origin, args.destination);
                } else if (name === 'trackBus') {
                    functionResponse = await functions.getBusStatus(args.query);
                } else if (name === 'getRouteManifest') {
                    functionResponse = await functions.getRouteManifest(args.routeId, args.date);
                } else if (name === 'getComplaints') {
                    functionResponse = functions.getComplaints(args.status);
                } else if (name === 'resolveComplaint') {
                    functionResponse = await functions.resolveComplaint(args.complaintId, args.resolutionMessage);
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
          return "I encountered an error processing your administrative request. Check console for details.";
      }
  }
}
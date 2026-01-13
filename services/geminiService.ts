
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
        systemInstruction: "You are Martha, Ena Coach Assistant. Help customers book tickets.",
        tools: [{ functionDeclarations: [searchRoutesTool] }]
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

  async sendMessage(msg: string, functions: any): Promise<{text: string, ticket?: Ticket}> {
      const response = await this.customerChat.sendMessage({ message: msg });
      return { text: response.text || "Thinking..." };
  }
}

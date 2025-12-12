import React from 'react';
import { Ticket } from '../types';

interface TicketCardProps {
  ticket: Ticket;
  onClose: () => void;
}

const TicketCard: React.FC<TicketCardProps> = ({ ticket, onClose }) => {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black bg-opacity-70 backdrop-blur-sm">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden relative transform transition-all scale-100">
        
        {/* Close Button */}
        <button 
          onClick={onClose}
          className="absolute top-4 right-4 text-white hover:text-red-200 z-10"
        >
          <i className="fas fa-times-circle text-2xl shadow-sm"></i>
        </button>

        {/* Header - Branding */}
        <div className="bg-gradient-to-r from-red-700 to-red-600 p-6 text-white text-center relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-full opacity-10 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')]"></div>
          <div className="relative z-10">
            <h2 className="text-2xl font-black tracking-widest uppercase mb-1">ENA COACH</h2>
            <p className="text-xs font-medium opacity-80 tracking-wide">PREMIUM CLASS TICKET</p>
          </div>
        </div>

        {/* Ticket Body */}
        <div className="p-6 bg-white relative">
          {/* Perforation effect */}
          <div className="absolute top-0 left-0 transform -translate-y-1/2 w-full flex justify-between px-2">
            {[...Array(12)].map((_, i) => (
              <div key={i} className="w-4 h-4 rounded-full bg-gray-700 opacity-0"></div> 
            ))}
          </div>

          {/* Route Info */}
          <div className="flex justify-between items-center mb-6 border-b border-dashed border-gray-200 pb-4">
            <div className="text-left">
              <p className="text-xs text-gray-400 font-bold uppercase">From</p>
              <p className="text-lg font-bold text-gray-800">{ticket.routeDetails?.origin.substring(0, 3).toUpperCase()}</p>
              <p className="text-xs text-gray-500">{ticket.routeDetails?.origin}</p>
            </div>
            <div className="flex-1 px-4 flex flex-col items-center">
               <i className="fas fa-bus text-red-600"></i>
               <div className="w-full h-px bg-red-200 my-1"></div>
               <p className="text-[10px] text-gray-400">{ticket.routeDetails?.departureTime}</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-gray-400 font-bold uppercase">To</p>
              <p className="text-lg font-bold text-gray-800">{ticket.routeDetails?.destination.substring(0, 3).toUpperCase()}</p>
              <p className="text-xs text-gray-500">{ticket.routeDetails?.destination}</p>
            </div>
          </div>

          {/* Passenger Info Grid */}
          <div className="grid grid-cols-2 gap-4 mb-6">
            <div>
              <p className="text-[10px] text-gray-400 font-bold uppercase">Passenger</p>
              <p className="text-sm font-bold text-gray-800 truncate">{ticket.passengerName}</p>
            </div>
            <div>
              <p className="text-[10px] text-gray-400 font-bold uppercase">Date</p>
              <p className="text-sm font-bold text-gray-800">{new Date(ticket.bookingTime).toLocaleDateString()}</p>
            </div>
            <div>
              <p className="text-[10px] text-gray-400 font-bold uppercase">Seat</p>
              <p className="text-xl font-black text-red-600">{ticket.seatNumber}</p>
            </div>
            <div>
              <p className="text-[10px] text-gray-400 font-bold uppercase">Class</p>
              <p className="text-sm font-bold text-gray-800">{ticket.routeDetails?.busType}</p>
            </div>
          </div>

          {/* QR Code Section */}
          <div className="flex flex-col items-center justify-center p-4 bg-gray-50 rounded-xl border border-gray-100">
             <div className="bg-white p-2 rounded shadow-sm mb-2">
                <img src={ticket.qrCodeUrl} alt="Ticket QR" className="w-32 h-32 object-contain" />
             </div>
             <p className="text-[10px] text-gray-400 font-mono mb-1">{ticket.id}</p>
             <p className={`text-xs font-bold px-2 py-0.5 rounded-full ${ticket.boardingStatus === 'boarded' ? 'bg-gray-200 text-gray-500' : 'bg-green-100 text-green-700'}`}>
                {ticket.boardingStatus === 'boarded' ? 'USED' : 'VALID FOR BOARDING'}
             </p>
          </div>
        </div>

        {/* Footer */}
        <div className="bg-gray-900 p-4 text-center">
          <p className="text-[10px] text-gray-400">Scan this QR code at the bus entrance.</p>
          <p className="text-[10px] text-gray-500 mt-1">&copy; Ena Coach Transportation</p>
        </div>
      </div>
    </div>
  );
};

export default TicketCard;
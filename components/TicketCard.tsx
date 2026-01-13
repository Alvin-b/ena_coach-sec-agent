
import React from 'react';
import { Ticket } from '../types';

interface TicketCardProps {
  ticket: Ticket;
  onClose: () => void;
}

const TicketCard: React.FC<TicketCardProps> = ({ ticket, onClose }) => {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md">
      <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-sm overflow-hidden relative transform transition-all animate-fade-in-up">
        
        {/* Close Button */}
        <button 
          onClick={onClose}
          className="absolute top-5 right-5 text-white/80 hover:text-white z-20 transition-colors"
        >
          <i className="fas fa-times-circle text-2xl shadow-lg"></i>
        </button>

        {/* Header - Branding */}
        <div className="bg-gradient-to-br from-red-700 via-red-600 to-orange-600 p-8 text-white text-center relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-full opacity-10 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')]"></div>
          <div className="absolute -top-10 -left-10 w-32 h-32 bg-white/10 rounded-full blur-2xl"></div>
          <div className="relative z-10">
            <h2 className="text-3xl font-black tracking-tighter uppercase mb-1">ENA COACH</h2>
            <p className="text-[10px] font-black opacity-80 tracking-[0.3em] uppercase">Premium Transit Service</p>
          </div>
        </div>

        {/* Ticket Body */}
        <div className="p-8 bg-white relative">
          {/* Decorative Dashed Line */}
          <div className="absolute top-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-gray-200 to-transparent"></div>

          {/* Route Info */}
          <div className="flex justify-between items-center mb-8 border-b border-gray-100 pb-6">
            <div className="text-left">
              <p className="text-[9px] text-gray-400 font-black uppercase tracking-widest mb-1">Departure</p>
              <p className="text-xl font-black text-gray-900 leading-none">{ticket.routeDetails?.origin.substring(0, 3).toUpperCase()}</p>
              <p className="text-[11px] text-gray-500 font-bold">{ticket.routeDetails?.origin}</p>
            </div>
            <div className="flex-1 px-4 flex flex-col items-center">
               <div className="text-red-600 animate-pulse">
                 <i className="fas fa-bus-alt text-xl"></i>
               </div>
               <div className="w-full h-[2px] bg-red-100 relative my-2">
                  <div className="absolute -left-1 -top-1 w-2 h-2 rounded-full bg-red-600"></div>
                  <div className="absolute -right-1 -top-1 w-2 h-2 rounded-full bg-gray-300"></div>
               </div>
               <p className="text-[10px] font-black text-red-600">{ticket.routeDetails?.departureTime}</p>
            </div>
            <div className="text-right">
              <p className="text-[9px] text-gray-400 font-black uppercase tracking-widest mb-1">Arrival</p>
              <p className="text-xl font-black text-gray-900 leading-none">{ticket.routeDetails?.destination.substring(0, 3).toUpperCase()}</p>
              <p className="text-[11px] text-gray-500 font-bold">{ticket.routeDetails?.destination}</p>
            </div>
          </div>

          {/* Passenger Info Grid */}
          <div className="grid grid-cols-2 gap-y-6 mb-8">
            <div>
              <p className="text-[9px] text-gray-400 font-black uppercase tracking-widest mb-1">Passenger Name</p>
              <p className="text-sm font-black text-gray-900 truncate">{ticket.passengerName}</p>
            </div>
            <div className="text-right">
              <p className="text-[9px] text-gray-400 font-black uppercase tracking-widest mb-1">Booking Date</p>
              <p className="text-sm font-black text-gray-900">{new Date(ticket.bookingTime).toLocaleDateString()}</p>
            </div>
            <div>
              <p className="text-[9px] text-gray-400 font-black uppercase tracking-widest mb-1">Assigned Seat</p>
              <div className="flex items-center gap-2">
                <span className="text-2xl font-black text-red-600 leading-none">{ticket.seatNumber}</span>
                <span className="text-[10px] font-bold text-gray-400 bg-gray-100 px-2 py-0.5 rounded uppercase">{ticket.routeDetails?.busType}</span>
              </div>
            </div>
            <div className="text-right">
              <p className="text-[9px] text-gray-400 font-black uppercase tracking-widest mb-1">Ticket Status</p>
              <span className={`inline-block px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-tighter ${ticket.boardingStatus === 'boarded' ? 'bg-gray-100 text-gray-400' : 'bg-green-100 text-green-700'}`}>
                {ticket.boardingStatus === 'boarded' ? 'SCANNED' : 'VALID'}
              </span>
            </div>
          </div>

          {/* QR Code Section */}
          <div className="flex flex-col items-center justify-center p-6 bg-gray-50 rounded-[2rem] border border-gray-100 shadow-inner group">
             <div className="bg-white p-3 rounded-2xl shadow-sm mb-4 transition-transform group-hover:scale-105 duration-500">
                <img src={ticket.qrCodeUrl} alt="Secure QR Code" className="w-40 h-40 object-contain mix-blend-multiply" />
             </div>
             <p className="text-[9px] text-gray-400 font-mono tracking-widest uppercase mb-1">Reference: {ticket.id}</p>
             <div className="flex items-center gap-2 text-green-600">
                <i className="fas fa-shield-check text-xs"></i>
                <p className="text-[9px] font-black uppercase tracking-[0.2em]">Digitally Secured</p>
             </div>
          </div>
        </div>

        {/* Footer */}
        <div className="bg-gray-950 p-6 text-center">
          <button className="w-full py-4 bg-red-600 text-white rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-red-700 transition shadow-lg active:scale-95 mb-4">
            <i className="fas fa-download mr-2"></i> Save to Gallery
          </button>
          <p className="text-[8px] text-gray-500 uppercase tracking-widest">Powered by Martha AI Engine &bull; Safe Travels</p>
        </div>
      </div>
    </div>
  );
};

export default TicketCard;

import { BusRoute } from '../types';

const BASE_ROUTES: Omit<BusRoute, 'id' | 'availableSeats' | 'capacity'>[] = [
  // Western Route (via Nakuru, Kericho/Eldoret)
  { origin: 'Nairobi', destination: 'Kisumu', departureTime: '08:00 AM', price: 1500, busType: 'Luxury', stops: ['Naivasha', 'Nakuru', 'Kericho', 'Ahero'] },
  { origin: 'Nairobi', destination: 'Kisumu', departureTime: '09:00 PM', price: 1500, busType: 'Luxury', stops: ['Naivasha', 'Nakuru', 'Kericho', 'Ahero'] },
  { origin: 'Nairobi', destination: 'Busia', departureTime: '07:30 AM', price: 1600, busType: 'Luxury', stops: ['Nakuru', 'Eldoret', 'Bungoma', 'Mumias'] },
  { origin: 'Nairobi', destination: 'Busia', departureTime: '08:00 PM', price: 1600, busType: 'Standard', stops: ['Nakuru', 'Eldoret', 'Bungoma'] },
  { origin: 'Nairobi', destination: 'Kakamega', departureTime: '08:00 AM', price: 1500, busType: 'Luxury', stops: ['Nakuru', 'Kapsabet', 'Chavakali'] },
  { origin: 'Nairobi', destination: 'Bungoma', departureTime: '09:00 PM', price: 1500, busType: 'Standard', stops: ['Nakuru', 'Eldoret', 'Webuye'] },
  { origin: 'Nairobi', destination: 'Kitale', departureTime: '07:00 AM', price: 1500, busType: 'Luxury', stops: ['Nakuru', 'Eldoret', 'Moi\'s Bridge'] },
  { origin: 'Nairobi', destination: 'Mumias', departureTime: '08:00 PM', price: 1600, busType: 'Standard', stops: ['Nakuru', 'Kisumu', 'Kakamega'] },
  { origin: 'Nairobi', destination: 'Siaya', departureTime: '08:30 AM', price: 1600, busType: 'Luxury', stops: ['Nakuru', 'Kisumu', 'Luanda'] },
  { origin: 'Nairobi', destination: 'Bondo', departureTime: '09:00 AM', price: 1600, busType: 'Luxury', stops: ['Nakuru', 'Kisumu', 'Nedwo'] },
  { origin: 'Nairobi', destination: 'Usenge', departureTime: '08:00 PM', price: 1700, busType: 'Standard', stops: ['Nakuru', 'Kisumu', 'Bondo'] },
  { origin: 'Nairobi', destination: 'Port Victoria', departureTime: '07:00 PM', price: 1700, busType: 'Standard', stops: ['Nakuru', 'Kisumu', 'Busia'] },

  // Nyanza South (via Narok, Kisii)
  { origin: 'Nairobi', destination: 'Kisii', departureTime: '07:00 AM', price: 1200, busType: 'Luxury', stops: ['Narok', 'Bomet', 'Sotik'] },
  { origin: 'Nairobi', destination: 'Kisii', departureTime: '11:00 AM', price: 1200, busType: 'Standard', stops: ['Narok', 'Bomet'] },
  { origin: 'Nairobi', destination: 'Homabay', departureTime: '08:00 AM', price: 1300, busType: 'Luxury', stops: ['Narok', 'Kisii', 'Rongo'] },
  { origin: 'Nairobi', destination: 'Migori', departureTime: '07:30 AM', price: 1400, busType: 'Luxury', stops: ['Narok', 'Kisii', 'Rongo', 'Awendo'] },
  { origin: 'Nairobi', destination: 'Sirare', departureTime: '06:00 AM', price: 1500, busType: 'Luxury', stops: ['Narok', 'Kisii', 'Migori', 'Kehancha'] },
  { origin: 'Nairobi', destination: 'Mbita', departureTime: '08:00 PM', price: 1400, busType: 'Standard', stops: ['Narok', 'Homabay'] },
  { origin: 'Nairobi', destination: 'Sori', departureTime: '07:00 PM', price: 1400, busType: 'Standard', stops: ['Narok', 'Homabay', 'Rod Kopany'] },
  { origin: 'Nairobi', destination: 'Kendu Bay', departureTime: '01:00 PM', price: 1300, busType: 'Standard', stops: ['Narok', 'Oyugis'] },
  { origin: 'Nairobi', destination: 'Oyugis', departureTime: '02:00 PM', price: 1200, busType: 'Standard', stops: ['Narok', 'Kisii'] },

  // Coast Route (via Mombasa Rd)
  { origin: 'Nairobi', destination: 'Mombasa', departureTime: '08:30 AM', price: 1500, busType: 'Luxury', stops: ['Mtito Andei', 'Voi', 'Mariakani'] },
  { origin: 'Nairobi', destination: 'Mombasa', departureTime: '09:00 PM', price: 1500, busType: 'Luxury', stops: ['Mtito Andei', 'Voi'] },
  { origin: 'Nairobi', destination: 'Malindi', departureTime: '07:00 PM', price: 2000, busType: 'Luxury', stops: ['Mombasa', 'Kilifi', 'Mtwapa'] },
  { origin: 'Nairobi', destination: 'Ukunda', departureTime: '08:00 PM', price: 1800, busType: 'Luxury', stops: ['Mombasa', 'Likoni'] },
  
  // Cross-Country (Mombasa to Western)
  { origin: 'Mombasa', destination: 'Kisumu', departureTime: '04:00 PM', price: 2500, busType: 'Luxury', stops: ['Nairobi', 'Nakuru', 'Kericho'] },
  { origin: 'Mombasa', destination: 'Busia', departureTime: '03:00 PM', price: 2600, busType: 'Luxury', stops: ['Nairobi', 'Nakuru', 'Eldoret'] },
  { origin: 'Mombasa', destination: 'Kitale', departureTime: '03:30 PM', price: 2600, busType: 'Standard', stops: ['Nairobi', 'Eldoret'] },

  // Short Haul / Others
  { origin: 'Nakuru', destination: 'Kisumu', departureTime: '10:00 AM', price: 800, busType: 'Standard', stops: ['Kericho'] },
  { origin: 'Eldoret', destination: 'Nairobi', departureTime: '02:00 PM', price: 1000, busType: 'Standard', stops: ['Nakuru'] },
  { origin: 'Kisumu', destination: 'Mombasa', departureTime: '01:00 PM', price: 2500, busType: 'Luxury', stops: ['Kericho', 'Nakuru', 'Nairobi'] },
];

// Helper to generate IDs and bidirectional routes
export const generateFullRouteList = (): BusRoute[] => {
  const fullRoutes: BusRoute[] = [];
  let idCounter = 1;

  BASE_ROUTES.forEach(route => {
    // 1. Add Forward Route
    fullRoutes.push({
      ...route,
      id: `R${idCounter.toString().padStart(3, '0')}`,
      availableSeats: 30 + Math.floor(Math.random() * 10), // Random seats 30-40
      capacity: 45,
    });
    idCounter++;

    // 2. Add Reverse Route (Automatic Two-Way)
    // Reverse the stops for the return journey
    const reverseStops = [...route.stops].reverse();
    fullRoutes.push({
      id: `R${idCounter.toString().padStart(3, '0')}`,
      origin: route.destination,
      destination: route.origin,
      departureTime: route.departureTime, // Simplify: assume same schedule for return
      price: route.price,
      availableSeats: 30 + Math.floor(Math.random() * 10),
      capacity: 45,
      busType: route.busType,
      stops: reverseStops
    });
    idCounter++;
  });

  return fullRoutes;
};

export const ALL_ROUTES = generateFullRouteList();
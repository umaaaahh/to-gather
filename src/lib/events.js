// Mock data for the mockup — Phase 2 will read this from a Firestore
// "events" collection instead (same shape: title/date/time/location/tag).
// Shared by the /notices page and the street's pull-up notice board.
export const EVENTS = [
  {
    id: "kickoff",
    title: "Street Festival Kickoff",
    date: new Date(2026, 8, 12),
    time: "10:00 AM",
    location: "Main Street",
    tag: "Festival",
  },
  {
    id: "art-workshop",
    title: "Kids' Art Workshop",
    date: new Date(2026, 8, 15),
    time: "2:00 PM",
    location: "Community Hall",
    tag: "Workshop",
  },
  {
    id: "bbq",
    title: "Community BBQ",
    date: new Date(2026, 8, 20),
    time: "12:00 PM",
    location: "Park Reserve",
    tag: "Social",
  },
  {
    id: "live-music",
    title: "Live Music Night",
    date: new Date(2026, 8, 24),
    time: "6:30 PM",
    location: "Notice Board Stage",
    tag: "Festival",
  },
  {
    id: "cleanup",
    title: "Neighbourhood Clean-up",
    date: new Date(2026, 8, 28),
    time: "9:00 AM",
    location: "Meet at the Tree",
    tag: "Volunteer",
  },
];

export const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

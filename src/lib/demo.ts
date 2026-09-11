import type { PublicGame } from "@/lib/types";

export const demoGame: PublicGame = {
  id: "demo-game",
  dojoId: "demo-dojo",
  dojoName: "The Thursday Dojo",
  title: "Friday Mah Jong",
  hostName: "Susan",
  startsAt: "2026-09-18T13:00:00-04:00",
  location: "Susan's house",
  status: "open",
  inviteCode: "demo",
  seatedCount: 6,
  waitlistCount: 0,
  capacity: 8,
  myRsvp: null,
  waitlist: [],
  tables: [
    {
      id: "table-1",
      tableNumber: 1,
      seats: [
        { id: "1-1", seatNumber: 1, player: { id: "p1", name: "Susan" } },
        { id: "1-2", seatNumber: 2, player: { id: "p2", name: "Joan" } },
        { id: "1-3", seatNumber: 3, player: { id: "p3", name: "Nancy" } },
        { id: "1-4", seatNumber: 4, player: { id: "p4", name: "Carol" } },
      ],
    },
    {
      id: "table-2",
      tableNumber: 2,
      seats: [
        { id: "2-1", seatNumber: 1, player: { id: "p5", name: "Linda" } },
        { id: "2-2", seatNumber: 2, player: { id: "p6", name: "Barbara" } },
        { id: "2-3", seatNumber: 3, player: null },
        { id: "2-4", seatNumber: 4, player: null },
      ],
    },
  ],
};

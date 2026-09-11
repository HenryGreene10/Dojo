export type GamePlayer = {
  id: string;
  name: string;
};

export type GameSeat = {
  id: string;
  seatNumber: number;
  player: GamePlayer | null;
};

export type GameTable = {
  id: string;
  tableNumber: number;
  seats: GameSeat[];
};

export type MyRsvp = {
  id: string;
  status: "seated" | "waitlisted";
  tableNumber: number | null;
  seatNumber: number | null;
} | null;

export type PublicGame = {
  id: string;
  dojoId: string;
  dojoName: string;
  title: string;
  hostName: string;
  startsAt: string;
  location: string;
  status: "open" | "closed" | "cancelled";
  inviteCode: string;
  seatedCount: number;
  waitlistCount: number;
  capacity: number;
  tables: GameTable[];
  waitlist: GamePlayer[];
  myRsvp: MyRsvp;
};

export type HostDashboardGame = {
  id: string;
  title: string;
  startsAt: string;
  location: string;
  inviteCode: string;
  seatedCount: number;
  capacity: number;
};

export type HostDashboardDojo = {
  id: string;
  name: string;
  role: "owner" | "host";
  games: HostDashboardGame[];
};

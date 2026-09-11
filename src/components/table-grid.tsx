"use client";

import { motion } from "motion/react";
import type { GameTable } from "@/lib/types";

export function TableGrid({ tables }: { tables: GameTable[] }) {
  return (
    <div className="tables-grid" aria-label="Mah Jong tables">
      {tables.map((table) => (
        <motion.section
          className="game-table"
          key={table.id}
          layout
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.28, ease: "easeOut" }}
          aria-label={`Table ${table.tableNumber}`}
        >
          <div className="table-title">Table {table.tableNumber}</div>
          <div className="table-surface" aria-hidden="true" />
          {table.seats.map((seat) => (
            <motion.div
              className={`seat seat-${seat.seatNumber}${seat.player ? "" : " empty"}`}
              key={seat.id}
              layout
              animate={seat.player ? { scale: [0.96, 1] } : { scale: 1 }}
              transition={{ duration: 0.22 }}
              title={seat.player?.name ?? "Open seat"}
            >
              {seat.player?.name ?? "Open seat"}
            </motion.div>
          ))}
        </motion.section>
      ))}
    </div>
  );
}

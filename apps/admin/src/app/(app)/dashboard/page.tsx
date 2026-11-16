"use client";

import React from "react";
import { StatCard, StatusBadge } from "@gunita/ui";

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-sm text-gray-500">
          Owner overview of Gunita Kopi operations
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Today Sales"
          value="₱14,850.00"
          trend={{ value: "+12.5%", isPositive: true }}
          subtitle="vs yesterday"
        />
        <StatCard
          title="Orders Completed"
          value="86"
          trend={{ value: "+5", isPositive: true }}
          subtitle="today"
        />
        <StatCard
          title="Low Stock Items"
          value="3"
          badge={<StatusBadge status="low_stock" label="Attention" />}
          subtitle="ingredients need restock"
        />
        <StatCard
          title="Gross Margin"
          value="68.4%"
          trend={{ value: "+1.2%", isPositive: true }}
          subtitle="avg recipe margin"
        />
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
        <h2 className="text-base font-semibold text-gray-900 mb-2">
          Live Store Activity
        </h2>
        <p className="text-sm text-gray-500">
          Real-time metrics and order stream will populate from{" "}
          <code>/api/dashboard</code> once feature development begins.
        </p>
      </div>
    </div>
  );
}

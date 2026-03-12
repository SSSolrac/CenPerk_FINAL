import { Outlet, NavLink, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { cn } from "../components/ui/utils";
import { Home, Gift, Activity, Award, User, Menu, X, Bell, Clock3, LogOut } from "lucide-react";
import type { MemberData } from "../types/loyalty";
import { ThemeInitializer } from ".././components/theme-initializer";
import { Toaster } from "../components/ui/sonner";
import type { AppOutletContext } from "../types/app-context";
import { loadMemberSnapshot } from "../lib/loyalty-supabase";
import { loadUserNotifications, type AppNotification } from "../lib/notifications";

import { supabase } from "../../utils/supabase/client";
import { clearStoredAuth } from "../auth/auth";

const USER_STORAGE_KEY = "points-dashboard-user-v1";

const DEFAULT_MEMBER: MemberData = {
  memberId: "",
  fullName: "Member",
  email: "",
  phone: "",
  birthdate: "",
  profileImage:
    "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?auto=format&fit=crop&w=300&q=80",
  tier: "Bronze",
  memberSince: "",
  status: "Active",
  points: 0,
  pendingPoints: 0,
  lifetimePoints: 0,
  expiringPoints: 0,
  daysUntilExpiry: 0,
  earnedThisMonth: 0,
  redeemedThisMonth: 0,
  profileComplete: false,
  hasDownloadedApp: false,
  surveysCompleted: 0,
  transactions: [],
};

function deriveCompletedTaskIds(user: MemberData): string[] {
  const pattern = /Task completed \(([^)]+)\)/i;
  return user.transactions
    .map((tx) => {
      const match = String(tx.description || "").match(pattern);
      return match?.[1] ?? null;
    })
    .filter((id): id is string => Boolean(id));
}

function loadUser(): MemberData {
  try {
    const raw = localStorage.getItem(USER_STORAGE_KEY);
    if (!raw) return DEFAULT_MEMBER;
    const parsed = { ...DEFAULT_MEMBER, ...JSON.parse(raw) } as MemberData;
    return parsed;
  } catch {
    return DEFAULT_MEMBER;
  }
}

export default function Root() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [user, setUser] = useState<MemberData>(loadUser);
  const [completedTaskIds, setCompletedTaskIds] = useState<string[]>([]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const navigate = useNavigate();

  useEffect(() => {
    localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user));
  }, [user]);

  const basePath = "/customer";

  const refreshUser = async () => {
    try {
      const snapshot = await loadMemberSnapshot(user);
      if (!snapshot) return;
      setUser((prev) => ({ ...prev, ...snapshot }));
    } catch {
    }
  };

  useEffect(() => {
    refreshUser().catch(() => {});
    loadUserNotifications().then(setNotifications).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const channel = supabase
      .channel("customer-notifications")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notification_outbox" },
        () => {
          loadUserNotifications().then(setNotifications).catch(() => {});
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    const fromTransactions = deriveCompletedTaskIds(user);
    if (fromTransactions.length === 0) return;
    setCompletedTaskIds((prev) => [...new Set([...prev, ...fromTransactions])]);
  }, [user, setCompletedTaskIds]);

  const navigation = [
    { name: "Dashboard", href: `${basePath}`, icon: Home },
    { name: "Earn Points", href: `${basePath}/earn`, icon: Gift },
    { name: "Activity", href: `${basePath}/activity`, icon: Activity },
    { name: "Rewards", href: `${basePath}/rewards`, icon: Award },
    { name: "Profile", href: `${basePath}/profile`, icon: User },
  ];

  const handleLogout = async () => {
    await supabase.auth.signOut();
    clearStoredAuth();
    navigate("/login", { replace: true });
  };

  return (
    <div className="min-h-screen bg-white">
      <ThemeInitializer />

      <div className="lg:hidden fixed top-0 left-0 right-0 z-40 bg-white border-b border-gray-200">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-[#1A2B47]">
              <span className="text-white font-bold text-sm">Z</span>
            </div>
            <div>
              <h1 className="font-bold text-gray-900">GREENOVATE</h1>
              <p className="text-xs text-gray-500">{user.tier} Member</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setNotifOpen((s) => !s)}
              className="relative p-2 rounded-lg hover:bg-gray-100"
              aria-label="Notifications"
            >
              <Bell className="w-5 h-5 text-[#1A2B47]" />
              {notifications.length > 0 ? (
                <span className="absolute -top-0.5 -right-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-[#00A3AD] px-1 text-[10px] font-bold text-white">
                  {Math.min(notifications.length, 9)}
                </span>
              ) : null}
            </button>
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="p-2 rounded-lg hover:bg-gray-100"
            >
              {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </div>

      <div
        className={cn(
          "fixed inset-y-0 left-0 z-30 w-64 bg-[#1A2B47] border-r border-white/15 transform transition-transform duration-300 ease-in-out",
          "lg:translate-x-0",
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="flex flex-col h-full">
          <div className="p-6 border-b border-white/15">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-[#00A3AD] rounded-xl flex items-center justify-center">
                <span className="text-white font-bold text-lg">Z</span>
              </div>
              <div>
                <h1 className="font-bold text-white">GREENOVATE</h1>
                <p className="text-xs text-slate-300">Member Panel</p>
              </div>
            </div>
          </div>

          <div className="p-6 border-b border-white/15">
            <div className="flex items-center gap-3">
              <img
                src={user.profileImage}
                alt={user.fullName}
                className="w-12 h-12 rounded-full object-cover border border-white/20 bg-white/10"
              />
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-white truncate">{user.fullName}</p>
                <div className="flex items-center gap-2 mt-1">
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-[#00A3AD] text-white">
                    {user.tier}
                  </span>
                  <span className="text-xs text-slate-300">{user.points.toLocaleString()} pts</span>
                </div>
              </div>
            </div>
          </div>

          <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
            {navigation.map((item) => (
              <NavLink
                key={item.name}
                to={item.href}
                end={item.href === basePath}
                onClick={() => setSidebarOpen(false)}
                className={({ isActive }) =>
                  cn(
                    "flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all",
                    isActive ? "bg-[#00A3AD] text-white" : "text-slate-100 hover:bg-white/10"
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    <item.icon className={cn("w-5 h-5", isActive && "text-white")} />
                    {item.name}
                  </>
                )}
              </NavLink>
            ))}
          </nav>

          <div className="p-4 border-t border-white/15 space-y-2">
            <button
              onClick={handleLogout}
              className="w-full inline-flex items-center justify-center gap-2 rounded-lg border border-white/20 px-3 py-2 text-sm font-medium text-white hover:bg-white/10"
            >
              <LogOut className="w-4 h-4" />
              Logout
            </button>
            <p className="text-xs text-center text-slate-300">© 2026 GREENOVATE</p>
          </div>
        </div>
      </div>

      {sidebarOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <div className="lg:pl-64 pt-16 lg:pt-0 bg-white">
        <main className="p-4 lg:p-8">
          <div className="mb-4 hidden lg:flex justify-end relative">
            <button
              onClick={() => setNotifOpen((s) => !s)}
              className="relative inline-flex items-center justify-center rounded-lg border border-gray-200 bg-white p-2 hover:bg-gray-50"
              aria-label="Notifications"
            >
              <Bell className="h-5 w-5 text-[#1A2B47]" />
              {notifications.length > 0 ? (
                <span className="absolute -top-1 -right-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-[#00A3AD] px-1 text-[10px] font-bold text-white">
                  {Math.min(notifications.length, 9)}
                </span>
              ) : null}
            </button>
          </div>

          {notifOpen ? (
            <div className="mb-4 lg:absolute lg:right-8 lg:top-20 z-50 w-full max-w-sm rounded-xl border border-gray-200 bg-white p-3 shadow-lg">
              <p className="mb-2 text-sm font-semibold text-[#1A2B47]">Notifications</p>
              {user.expiringPoints > 0 || notifications.length > 0 ? (
                <div className="space-y-2">
                  {user.expiringPoints > 0 ? <div className="rounded-lg border border-[#00A3AD]/35 bg-[#e6f8fa] p-3">
                  <div className="flex items-start gap-2">
                    <Clock3 className="h-4 w-4 mt-0.5 text-[#1A2B47]" />
                    <div>
                      <p className="text-sm font-semibold text-[#1A2B47]">{user.expiringPoints} points expiring soon</p>
                      <p className="text-xs text-[#1A2B47]/80">Expires in {user.daysUntilExpiry} days.</p>
                    </div>
                  </div>
                  <NavLink
                    to={`${basePath}/rewards`}
                    onClick={() => setNotifOpen(false)}
                    className="mt-2 inline-flex rounded-md bg-[#1A2B47] px-3 py-1.5 text-xs font-medium text-white hover:brightness-110"
                  >
                    Redeem now
                  </NavLink>
                  </div> : null}

                  {notifications.slice(0, 5).map((item) => (
                    <div key={item.id} className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                      <p className="text-sm font-semibold text-[#1A2B47]">{item.subject}</p>
                      <p className="text-xs text-gray-600 mt-1">{item.message}</p>
                      <p className="text-[11px] text-gray-500 mt-1">{new Date(item.createdAt).toLocaleString()}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-500">No new notifications.</p>
              )}
            </div>
          ) : null}

          <Outlet
            context={
              {
                user,
                setUser,
                refreshUser,
                completedTaskIds,
                setCompletedTaskIds,
              } satisfies AppOutletContext
            }
          />
        </main>
      </div>

      <Toaster position="top-right" richColors />
    </div>
  );
}


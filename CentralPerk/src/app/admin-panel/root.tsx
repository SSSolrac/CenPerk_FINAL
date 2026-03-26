import { Activity, Award, Bell, Home, LogOut, Menu, Settings, Users, X } from "lucide-react";
import { useEffect, useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { cn } from "../components/ui/utils";
import { supabase } from "../../utils/supabase/client";
import { loadUserNotifications, type AppNotification } from "../lib/notifications";
const IDLE_TIMEOUT_MS = 30 * 60 * 1000;


const navItems = [
  { to: "/admin", label: "Dashboard", icon: Home, end: true },
  { to: "/admin/members", label: "Members", icon: Users },
  { to: "/admin/activity", label: "Activity", icon: Activity },
  { to: "/admin/rewards", label: "Rewards", icon: Award },
  { to: "/admin/settings", label: "Settings", icon: Settings },
];

export default function AdminRoot() {
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);



  useEffect(() => {
    loadUserNotifications().then(setNotifications).catch(() => {});

    const channel = supabase
      .channel("admin-notifications")
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
    let timeoutRef: ReturnType<typeof setTimeout>;

    const resetTimer = () => {
      clearTimeout(timeoutRef);
      timeoutRef = setTimeout(() => {
        handleLogout().catch(() => {});
      }, IDLE_TIMEOUT_MS);
    };

    const events: (keyof WindowEventMap)[] = ["mousemove", "keydown", "click", "scroll", "touchstart"];
    events.forEach((eventName) => window.addEventListener(eventName, resetTimer, { passive: true }));
    resetTimer();

    return () => {
      clearTimeout(timeoutRef);
      events.forEach((eventName) => window.removeEventListener(eventName, resetTimer));
    };
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    localStorage.removeItem("role");
    localStorage.removeItem("token");
    localStorage.removeItem("user_id");
    navigate("/login", { replace: true });
  };

  return (
    <div className="min-h-screen bg-white" style={{ fontFamily: "'Poppins', sans-serif" }}>
      <div className="lg:hidden fixed top-0 left-0 right-0 z-40 bg-white border-b border-gray-200">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-[#1A2B47]">
              <span className="text-white font-bold text-sm">A</span>
            </div>
            <div>
              <h1 className="font-bold text-gray-900">GREENOVATE</h1>
              <p className="text-xs text-gray-500">Admin Panel</p>
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
              onClick={() => setSidebarOpen((s) => !s)}
              className="p-2 rounded-lg hover:bg-gray-100"
              aria-label="Toggle sidebar"
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
                <span className="text-white font-bold text-lg">A</span>
              </div>
              <div>
                <h1 className="font-bold text-white">GREENOVATE</h1>
                <p className="text-xs text-slate-300">Admin Panel</p>
              </div>
            </div>
          </div>

          <div className="p-6 border-b border-white/15">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full border border-white/20 bg-white/10 text-white flex items-center justify-center font-semibold">
                AD
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-white truncate">Admin User</p>
                <div className="flex items-center gap-2 mt-1">
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-[#f5f0ff] text-[#6d28d9] border border-[#d7c2ff]">
                    Administrator
                  </span>
                </div>
              </div>
            </div>
          </div>

          <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
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
                    {item.label}
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
            <div className="mb-4 lg:absolute lg:right-8 lg:top-20 z-50 w-full max-w-sm rounded-xl border border-[#9ed8ff] bg-[#f8fcff] p-3 shadow-lg">
              <p className="mb-2 text-sm font-semibold text-[#1A2B47]">Notifications</p>
              {notifications.length === 0 ? (
                <p className="text-sm text-gray-500">No new notifications.</p>
              ) : (
                <div className="space-y-2">
                  {notifications.slice(0, 5).map((item) => (
                    <div key={item.id} className="rounded-lg border border-gray-200 bg-white p-2">
                      <p className="text-sm font-semibold text-[#1A2B47]">{item.subject}</p>
                      <p className="text-xs text-gray-600 mt-1">{item.message}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : null}

          <Outlet />
        </main>
      </div>
    </div>
  );
}


import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { Calendar, Award, Star, Edit2, Save, X, Upload } from "lucide-react";
import { useOutletContext } from "react-router-dom";
import type { AppOutletContext } from "../../types/app-context";
import { Card } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Badge } from "../../components/ui/badge";
import { Progress } from "../../components/ui/progress";
import { toast } from "sonner";
import { loadTierHistory, updateMemberProfile, uploadMemberProfilePhoto } from "../../lib/loyalty-supabase";
import TierHistory from "../../components/TierHistory";

function splitName(fullName: string) {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return { firstName: parts[0] || "", lastName: "" };
  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(" "),
  };
}

export default function Profile() {
  const { user, setUser, refreshUser } = useOutletContext<AppOutletContext>();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState({
    fullName: user.fullName,
    email: user.email,
    phone: user.phone,
    birthdate: user.birthdate || "",
    address: user.address || "",
    profileImage: user.profileImage,
  });
  const [tierTimeline, setTierTimeline] = useState<{ id: string; old_tier: string; new_tier: string; changed_at: string; reason?: string }[]>([]);

  useEffect(() => {
    setFormData({
      fullName: user.fullName,
      email: user.email,
      phone: user.phone,
      birthdate: user.birthdate || "",
      address: user.address || "",
      profileImage: user.profileImage,
    });

    loadTierHistory(user.memberId, user.email)
      .then((rows) =>
        setTierTimeline(
          rows.map((r) => ({
            id: String(r.id),
            old_tier: String(r.old_tier || "Bronze"),
            new_tier: String(r.new_tier || "Bronze"),
            changed_at: String(r.changed_at || new Date().toISOString()),
            reason: r.reason ? String(r.reason) : undefined,
          }))
        )
      )
      .catch(() => setTierTimeline([]));
  }, [user]);

  const handleSave = async () => {
    const { firstName, lastName } = splitName(formData.fullName);
    if (!firstName) {
      toast.error("Please enter a valid full name.");
      return;
    }

    try {
      await updateMemberProfile({
        memberIdentifier: user.memberId,
        fallbackEmail: user.email,
        firstName,
        lastName,
        email: formData.email,
        phone: formData.phone,
        birthdate: formData.birthdate,
        address: formData.address,
        profilePhotoUrl: formData.profileImage,
      });

      setUser((prev) => ({
        ...prev,
        fullName: formData.fullName,
        email: formData.email,
        phone: formData.phone,
        birthdate: formData.birthdate,
        address: formData.address,
        profileImage: formData.profileImage,
      }));

      toast.success("Profile updated!", {
        description: "Your changes have been saved successfully.",
      });
      setIsEditing(false);
      await refreshUser();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update profile.");
    }
  };

  const handleCancel = () => {
    setFormData({
      fullName: user.fullName,
      email: user.email,
      phone: user.phone,
      birthdate: user.birthdate || "",
      address: user.address || "",
      profileImage: user.profileImage,
    });
    setIsEditing(false);
  };

  const handlePhotoUpload = () => {
    fileInputRef.current?.click();
  };

  const handleImageChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !file.type.startsWith("image/")) return;
    uploadMemberProfilePhoto(user.memberId, file)
      .then((publicUrl) => {
        setFormData((prev) => ({ ...prev, profileImage: publicUrl }));
        setUser((prev) => ({ ...prev, profileImage: publicUrl }));
      })
      .catch((error) => {
        toast.error(error instanceof Error ? error.message : "Photo upload failed.");
      });
    event.target.value = "";
  };

  const tierBenefits: Record<"Bronze" | "Silver" | "Gold", string[]> = {
    Bronze: [
      "Earn 1 point per $1 spent",
      "Basic member promotions",
      "Monthly welcome offers",
    ],
    Silver: [
      "Earn 2 points per $1 spent",
      "Birthday month bonus: 100 points",
      "Early access to new products",
    ],
    Gold: [
      "Earn 3 points per $1 spent",
      "Birthday month bonus: 200 points",
      "Priority customer support",
      "Exclusive Gold member events",
      "Free delivery on online orders",
    ],
  };

  const nextTierInfo = {
    Bronze: { name: "Silver", pointsNeeded: 250 },
    Silver: { name: "Gold", pointsNeeded: 750 },
    Gold: { name: "Gold", pointsNeeded: 750 },
  } as const;

  const nextTier = nextTierInfo[user.tier];
  const tierProgress =
    user.tier === "Gold"
      ? 100
      : Math.min(100, (user.lifetimePoints / nextTier.pointsNeeded) * 100);

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Profile</h1>
        <p className="text-gray-500 mt-1">Manage your account and view your membership details</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card className="p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="font-semibold text-gray-900 text-lg">Personal Information</h3>
              {!isEditing ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsEditing(true)}
                  className="border-emerald-200 bg-white text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700"
                >
                  <Edit2 className="w-4 h-4 mr-2" />
                  Edit
                </Button>
              ) : (
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={handleCancel}>
                    <X className="w-4 h-4 mr-2" />
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleSave}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white"
                  >
                    <Save className="w-4 h-4 mr-2" />
                    Save
                  </Button>
                </div>
              )}
            </div>

            <div className="flex items-center gap-6 mb-6">
              <img
                src={formData.profileImage}
                alt={formData.fullName}
                className="w-14 h-14 rounded-full object-cover border border-[#00A3AD]/30 bg-white"
              />
              <div>
                <h2 className="text-3xl font-bold text-gray-900">{formData.fullName}</h2>
                <div className="flex items-center gap-2 mt-2">
                  <Badge className="bg-[#1A2B47] text-white">{user.tier} Member</Badge>
                  <Badge
                    variant="outline"
                    className={
                      user.status === "Active"
                        ? "border-[#00A3AD]/40 text-[#007d84]"
                        : "border-gray-200 text-gray-500"
                    }
                  >
                    {user.status}
                  </Badge>
                </div>
                {isEditing ? (
                  <div className="mt-3 flex items-center gap-2">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleImageChange}
                    />
                    <Button type="button" variant="outline" size="sm" onClick={handlePhotoUpload}>
                      <Upload className="w-4 h-4 mr-2" />
                      Upload Photo
                    </Button>
                  </div>
                ) : null}
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <Label htmlFor="fullName">Full Name</Label>
                <Input
                  id="fullName"
                  value={formData.fullName}
                  onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                  disabled={!isEditing}
                  className="mt-2"
                />
              </div>
              <div>
                <Label htmlFor="email">Email Address</Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  disabled={!isEditing}
                  className="mt-2"
                />
              </div>
              <div>
                <Label htmlFor="phone">Phone Number</Label>
                <Input
                  id="phone"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  disabled={!isEditing}
                  className="mt-2"
                />
              </div>
              <div>
                <Label htmlFor="birthdate">Birthdate</Label>
                <Input
                  id="birthdate"
                  type="date"
                  value={formData.birthdate}
                  onChange={(e) => setFormData({ ...formData, birthdate: e.target.value })}
                  disabled={!isEditing}
                  className="mt-2"
                />
              </div>
              <div>
                <Label htmlFor="address">Address</Label>
                <Input
                  id="address"
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  disabled={!isEditing}
                  className="mt-2"
                />
              </div>
            </div>
          </Card>

          <Card className="p-6">
            <h3 className="font-semibold text-gray-900 text-lg mb-6">Membership Details</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 bg-emerald-100 rounded-xl flex items-center justify-center flex-shrink-0">
                  <Award className="w-6 h-6 text-emerald-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-600">Member ID</p>
                  <p className="font-semibold text-gray-900 mt-1">{user.memberId}</p>
                </div>
              </div>
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center flex-shrink-0">
                  <Calendar className="w-6 h-6 text-blue-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-600">Member Since</p>
                  <p className="font-semibold text-gray-900 mt-1">{user.memberSince}</p>
                </div>
              </div>
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center flex-shrink-0">
                  <Star className="w-6 h-6 text-purple-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-600">Current Points</p>
                  <p className="font-semibold text-gray-900 mt-1">{user.points.toLocaleString()}</p>
                </div>
              </div>
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 bg-orange-100 rounded-xl flex items-center justify-center flex-shrink-0">
                  <Star className="w-6 h-6 text-orange-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-600">Lifetime Points</p>
                  <p className="font-semibold text-gray-900 mt-1">{user.lifetimePoints.toLocaleString()}</p>
                </div>
              </div>
            </div>
          </Card>

          <Card className="p-6">
            <h3 className="font-semibold text-gray-900 text-lg mb-4">{user.tier} Tier Benefits</h3>
            <ul className="space-y-3">
              {(tierBenefits[user.tier] ?? []).map((benefit, index) => (
                <li key={index} className="flex items-start gap-3">
                  <div className="w-5 h-5 bg-emerald-100 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                    <svg className="w-3 h-3 text-emerald-600" fill="currentColor" viewBox="0 0 20 20">
                      <path
                        fillRule="evenodd"
                        d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </div>
                  <span className="text-gray-700">{benefit}</span>
                </li>
              ))}
            </ul>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="p-6">
            <h3 className="font-semibold text-gray-900 mb-4">Tier Progress</h3>
            <div className="space-y-4">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-600">
                  {user.tier === "Gold" ? "Max tier achieved" : `Progress to ${nextTier.name}`}
                </span>
                <span className="font-semibold text-gray-900">{Math.min(100, Math.round(tierProgress))}%</span>
              </div>
              <Progress value={tierProgress > 100 ? 100 : tierProgress} className="h-3" />
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-600">
                  {Math.min(user.lifetimePoints, nextTier.pointsNeeded).toLocaleString()} / {nextTier.pointsNeeded.toLocaleString()}
                </span>
                <span className="text-[#1A2B47] font-medium">
                  {user.tier === "Gold"
                    ? "Top tier"
                    : `${Math.max(0, nextTier.pointsNeeded - user.lifetimePoints).toLocaleString()} to go`}
                </span>
              </div>
            </div>
          </Card>

          <Card className="p-6">
            <h3 className="font-semibold text-gray-900 mb-4">Quick Stats</h3>
            <div className="space-y-4">
              <div className="flex items-center justify-between pb-4 border-b border-gray-200">
                <span className="text-gray-600 text-sm">This Month</span>
                <div className="text-right">
                  <p className="font-semibold text-green-600">+{user.earnedThisMonth}</p>
                  <p className="text-xs text-gray-500">earned</p>
                </div>
              </div>
              <div className="flex items-center justify-between pb-4 border-b border-gray-200">
                <span className="text-gray-600 text-sm">Redeemed</span>
                <div className="text-right">
                  <p className="font-semibold text-orange-600">-{user.redeemedThisMonth}</p>
                  <p className="text-xs text-gray-500">this month</p>
                </div>
              </div>
              <div className="flex items-center justify-between pb-4 border-b border-gray-200">
                <span className="text-gray-600 text-sm">Transactions</span>
                <div className="text-right">
                  <p className="font-semibold text-gray-900">{user.transactions.length}</p>
                  <p className="text-xs text-gray-500">total</p>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-600 text-sm">Surveys Completed</span>
                <div className="text-right">
                  <p className="font-semibold text-gray-900">{user.surveysCompleted}</p>
                  <p className="text-xs text-gray-500">surveys</p>
                </div>
              </div>
            </div>
          </Card>

          <Card className="p-6">
            <h3 className="font-semibold text-gray-900 mb-4">Account Status</h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Profile Complete</span>
                <Badge className={user.profileComplete ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-700"}>
                  {user.profileComplete ? "Yes" : "No"}
                </Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">App Downloaded</span>
                <Badge className={user.hasDownloadedApp ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-700"}>
                  {user.hasDownloadedApp ? "Yes" : "No"}
                </Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Email Verified</span>
                <Badge className="bg-green-100 text-green-700">Verified</Badge>
              </div>
            </div>
          </Card>

          <TierHistory timeline={tierTimeline} />
        </div>
      </div>
    </div>
  );
}

import { User } from "lucide-react";

import { ProfileForm } from "@/components/profile/profile-form";

export default function ProfilePage() {
  return (
    <div className="p-4 sm:p-6 space-y-6">
      <div className="flex items-center gap-3">
        <User className="size-6 text-muted-foreground" />
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Profile</h2>
          <p className="text-sm text-muted-foreground">
            Manage your personal information and password.
          </p>
        </div>
      </div>

      <div className="max-w-2xl">
        <ProfileForm />
      </div>
    </div>
  );
}

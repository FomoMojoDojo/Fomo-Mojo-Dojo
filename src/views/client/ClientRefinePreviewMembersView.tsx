import { useNavigate } from "react-router-dom";
import { useClientViewData } from "@/hooks/useClientViewData";
import { WorkshopSidebar, type SidebarTabKey } from "@/components/client/WorkshopSidebar";
import MemberRolePanel from "@/components/admin/MemberRolePanel";
import {
  CLIENT_REFINE_PREVIEW_ROUTE,
  CLIENT_REFINE_PREVIEW_WORKSHOP_ROUTE,
  CLIENT_REFINE_PREVIEW_COMPANY_ROUTE,
  CLIENT_REFINE_PREVIEW_MEMBERS_ROUTE,
} from "@/lib/clientRefinePreview";
import "@/styles/client-refine-preview.css";

// Dedicated admin-only Member Roles page (checkpoint 6 relocation). Operator-only
// via the route's AdminModeRoute>InternalViewOnlyRoute double-gate; MemberRolePanel
// additionally self-gates on workspace.member.assignRole.
export default function ClientRefinePreviewMembersView() {
  const navigate = useNavigate();
  const { activeCompany } = useClientViewData({ actionLimit: 0 });

  function goTab(tab: SidebarTabKey) {
    navigate(`${CLIENT_REFINE_PREVIEW_WORKSHOP_ROUTE}?tab=${tab}`);
  }

  return (
    <div className="crpv-page" style={{ display: "flex", flexDirection: "column", minHeight: "100dvh" }}>
      <div className="crpv-ws-body" style={{ flex: 1 }}>
        <WorkshopSidebar
          activeTab="__members__"
          onTabClick={goTab}
          onHome={() => navigate(CLIENT_REFINE_PREVIEW_ROUTE)}
          onCompany={() => navigate(CLIENT_REFINE_PREVIEW_COMPANY_ROUTE)}
          onMembers={() => navigate(CLIENT_REFINE_PREVIEW_MEMBERS_ROUTE)}
        />

        <div className="crpv-ws-content-col" style={{ overflowY: "auto" }}>
          <div style={{ padding: "32px 36px", maxWidth: 860 }}>
            <MemberRolePanel companyId={activeCompany?.id} />
          </div>
        </div>
      </div>
    </div>
  );
}

import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Plus,
  Save,
} from "lucide-react";
import { toast } from "sonner";
import TopNav from "@/components/layout/TopNav";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ClientOnboardingMojoMapView } from "@/pages/ClientOnboardingMojoMap";
import { useClientOnboardingMojoMap } from "@/hooks/useClientOnboardingMojoMap";
import {
  CLIENT_ONBOARDING_MOJOMAP_ID,
  CLIENT_ONBOARDING_MOJOMAP_ROUTE,
  type ActionGroup,
  type ActionItem,
  type ConstraintConfig,
  FOUNDER_OWNER_DEFAULTS,
  type HealthSubscore,
  type OnboardingLayer,
  type OnboardingMapConfig,
  type OwnershipConfig,
} from "@/lib/clientOnboardingMojoMapConfig";
import { getOnboardingOwnershipScoreModel } from "@/lib/scoring/onboardingOwnership";

const EDITOR_SECTIONS = [
  "metadata",
  "outcome",
  "layers",
  "constraint",
  "actions",
  "score",
  "loop",
] as const;
const AUTOSAVE_DEBOUNCE_MS = 900;

const LAYER_STATUS_OPTIONS: OnboardingLayer["status"][] = [
  "not_started",
  "planned",
  "in_progress",
];

const MAP_STATUS_OPTIONS: OnboardingMapConfig["status"][] = [
  "active",
  "draft",
  "archived",
];

const CONSTRAINT_PRIORITY_OPTIONS: NonNullable<ConstraintConfig["priority"]>[] = [
  "highest",
  "high",
  "medium",
  "low",
];

const CONSTRAINT_SEVERITY_OPTIONS: NonNullable<ConstraintConfig["severity"]>[] = [
  "high",
  "medium",
  "low",
];

const ACTION_STATUS_OPTIONS: ActionItem["status"][] = [
  "not_started",
  "planned",
  "in_progress",
];

const ACTION_OWNER_OPTIONS = [...FOUNDER_OWNER_DEFAULTS] as const;
const ACTION_TIMEFRAME_OPTIONS: NonNullable<ActionItem["timeframe"]>[] = [
  "now",
  "next",
  "later",
];
const ACTION_IMPACT_BANDS = ["high", "medium", "low"] as const;

function cloneConfig(config: OnboardingMapConfig): OnboardingMapConfig {
  if (typeof structuredClone === "function") {
    return structuredClone(config);
  }
  return JSON.parse(JSON.stringify(config)) as OnboardingMapConfig;
}

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function formatSelectLabel(value: string) {
  return value.replace(/_/g, " ");
}

function impactBandFromValue(value: number) {
  if (value >= 8) return "high";
  if (value >= 6) return "medium";
  return "low";
}

function impactValueFromBand(band: (typeof ACTION_IMPACT_BANDS)[number]) {
  if (band === "high") return 8;
  if (band === "medium") return 6;
  return 4;
}

function parseContributorsInput(value: string) {
  return Array.from(
    new Set(
      value
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  );
}

function createLayer(index: number): OnboardingLayer {
  const number = index + 1;
  return {
    id: `layer_${Date.now()}_${number}`,
    title: `New Layer ${number}`,
    purpose: "",
    summary: "",
    content: [],
    suggestedInputs: [],
    outputs: [],
    outputLabel: "",
    status: "planned",
    notes: "",
  };
}

function createAction(groupId: ActionGroup["id"], index: number): ActionItem {
  return {
    id: `${groupId}-${Date.now()}-${index + 1}`,
    title: "",
    description: "",
    ownership: {
      primaryOwner: ACTION_OWNER_OPTIONS[0],
      decider: ACTION_OWNER_OPTIONS[0],
      contributors: [ACTION_OWNER_OPTIONS[1]],
    },
    status: "planned",
    impact: 6,
    timeframe: "next",
  };
}

function createSubscore(index: number): HealthSubscore {
  return {
    id: `subscore_${Date.now()}_${index + 1}`,
    label: "New Subscore",
    value: 0,
  };
}

function validateConfig(config: OnboardingMapConfig): string[] {
  const errors: string[] = [];
  if (!config.name.trim()) errors.push("Map name is required.");
  if (!config.ownership.primaryOwner.trim()) errors.push("Map primary owner is required.");
  if (!config.outcome.title.trim()) errors.push("Outcome title is required.");
  if (!config.layers.length) errors.push("At least one layer is required.");
  if (!config.constraint.title.trim()) errors.push("Primary constraint title is required.");
  if (!Number.isFinite(config.health.overallScore)) {
    errors.push("Overall score must be numeric.");
  }
  config.health.subscores.forEach((subscore, index) => {
    if (!Number.isFinite(subscore.value)) {
      errors.push(`Subscore #${index + 1} value must be numeric.`);
    } else if (subscore.value < 0 || subscore.value > 100) {
      errors.push(`Subscore #${index + 1} value must be between 0 and 100.`);
    }
  });
  config.actionGroups.forEach((group) => {
    group.items.forEach((item, index) => {
      if (!item.title.trim()) {
        errors.push(`${group.title} action #${index + 1} is missing a title.`);
      }
      if (!item.ownership.primaryOwner.trim()) {
        errors.push(`${group.title} action #${index + 1} is missing a primary owner.`);
      }
    });
  });
  return errors;
}

type StringListEditorProps = {
  label: string;
  items: string[];
  onChange: (nextItems: string[]) => void;
  addLabel: string;
  inputAriaPrefix: string;
};

function StringListEditor({
  label,
  items,
  onChange,
  addLabel,
  inputAriaPrefix,
}: StringListEditorProps) {
  const nextItems = items ?? [];
  return (
    <div className="space-y-2">
      <Label className="text-xs uppercase tracking-wide text-muted-foreground">{label}</Label>
      {nextItems.length === 0 ? (
        <p className="text-xs text-muted-foreground">No items yet.</p>
      ) : null}
      {nextItems.map((item, index) => (
        <div key={`${inputAriaPrefix}-${index}`} className="flex items-center gap-2">
          <Input
            value={item}
            onChange={(e) => {
              const copy = [...nextItems];
              copy[index] = e.target.value;
              onChange(copy);
            }}
            aria-label={`${inputAriaPrefix} ${index + 1}`}
          />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-label={`Move ${inputAriaPrefix} ${index + 1} up`}
            onClick={() => {
              if (index === 0) return;
              const copy = [...nextItems];
              [copy[index - 1], copy[index]] = [copy[index], copy[index - 1]];
              onChange(copy);
            }}
          >
            Up
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-label={`Move ${inputAriaPrefix} ${index + 1} down`}
            onClick={() => {
              if (index === nextItems.length - 1) return;
              const copy = [...nextItems];
              [copy[index + 1], copy[index]] = [copy[index], copy[index + 1]];
              onChange(copy);
            }}
          >
            Down
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-label={`Remove ${inputAriaPrefix} ${index + 1}`}
            onClick={() => {
              onChange(nextItems.filter((_, itemIndex) => itemIndex !== index));
            }}
          >
            Remove
          </Button>
        </div>
      ))}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => onChange([...(nextItems ?? []), ""])}
      >
        <Plus />
        {addLabel}
      </Button>
    </div>
  );
}

type OwnershipEditorProps = {
  idPrefix: string;
  ownership: OwnershipConfig;
  onChange: (nextOwnership: OwnershipConfig) => void;
  warningText: string;
};

function OwnershipEditor({
  idPrefix,
  ownership,
  onChange,
  warningText,
}: OwnershipEditorProps) {
  const [contributorDraft, setContributorDraft] = useState("");
  const contributors = ownership.contributors ?? [];
  const missingPrimaryOwner = !ownership.primaryOwner.trim();

  const updateOwnership = (updates: Partial<OwnershipConfig>) => {
    onChange({
      ...ownership,
      ...updates,
    });
  };

  const toggleContributor = (person: string) => {
    const exists = contributors.includes(person);
    const next = exists
      ? contributors.filter((item) => item !== person)
      : [...contributors, person];
    updateOwnership({ contributors: next });
  };

  const addContributorsFromInput = () => {
    const parsed = parseContributorsInput(contributorDraft);
    if (!parsed.length) return;
    updateOwnership({
      contributors: Array.from(new Set([...contributors, ...parsed])),
    });
    setContributorDraft("");
  };

  return (
    <div className="space-y-3 rounded-md border border-[#e7eee2] bg-[#fcfdfc] p-3">
      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-primary-owner`}>Primary Owner</Label>
        <div className="flex flex-wrap gap-2">
          {ACTION_OWNER_OPTIONS.map((owner) => (
            <Button
              key={`${idPrefix}-owner-${owner}`}
              type="button"
              size="sm"
              variant={ownership.primaryOwner === owner ? "secondary" : "outline"}
              onClick={() => updateOwnership({ primaryOwner: owner })}
            >
              {owner}
            </Button>
          ))}
        </div>
        <Input
          id={`${idPrefix}-primary-owner`}
          list="owner-suggestions"
          value={ownership.primaryOwner}
          placeholder="Primary owner"
          onChange={(e) => updateOwnership({ primaryOwner: e.target.value })}
        />
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor={`${idPrefix}-decider`}>Decider</Label>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => updateOwnership({ decider: ownership.primaryOwner || undefined })}
          >
            Same as Primary Owner
          </Button>
        </div>
        <div className="flex flex-wrap gap-2">
          {ACTION_OWNER_OPTIONS.map((owner) => (
            <Button
              key={`${idPrefix}-decider-${owner}`}
              type="button"
              size="sm"
              variant={ownership.decider === owner ? "secondary" : "outline"}
              onClick={() => updateOwnership({ decider: owner })}
            >
              {owner}
            </Button>
          ))}
        </div>
        <Input
          id={`${idPrefix}-decider`}
          list="owner-suggestions"
          value={ownership.decider ?? ""}
          placeholder="Optional decider"
          onChange={(e) => updateOwnership({ decider: e.target.value || undefined })}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-contributors`}>Contributors</Label>
        <p className="text-xs text-[#6e847f]">Tap founders to add or remove quickly.</p>
        <div className="flex flex-wrap gap-2">
          {ACTION_OWNER_OPTIONS.map((owner) => (
            <Button
              key={`${idPrefix}-contributor-${owner}`}
              type="button"
              size="sm"
              variant={contributors.includes(owner) ? "secondary" : "outline"}
              onClick={() => toggleContributor(owner)}
            >
              {owner}
            </Button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <Input
            id={`${idPrefix}-contributors`}
            value={contributorDraft}
            placeholder="Add contributor (comma-separated supported)"
            onChange={(e) => setContributorDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addContributorsFromInput();
              }
            }}
          />
          <Button type="button" variant="outline" size="sm" onClick={addContributorsFromInput}>
            Add
          </Button>
        </div>
        {contributors.length ? (
          <div className="flex flex-wrap gap-2">
            {contributors.map((contributor) => (
              <Badge key={`${idPrefix}-chip-${contributor}`} variant="secondary" className="flex items-center gap-1">
                <span>{contributor}</span>
                <button
                  type="button"
                  className="text-xs opacity-80 hover:opacity-100"
                  aria-label={`Remove contributor ${contributor}`}
                  onClick={() =>
                    updateOwnership({
                      contributors: contributors.filter((item) => item !== contributor),
                    })
                  }
                >
                  x
                </button>
              </Badge>
            ))}
          </div>
        ) : (
          <p className="text-xs text-[#6e847f]">No contributors yet. Add only who helps execute.</p>
        )}
      </div>

      <p className="text-xs text-[#6e847f]">One clear owner keeps momentum moving.</p>
      {missingPrimaryOwner ? (
        <div className="rounded-md border border-amber-300/60 bg-amber-50/70 px-3 py-2 text-xs text-amber-900">
          {warningText}
        </div>
      ) : null}
    </div>
  );
}

export default function ClientOnboardingMojoMapEditor() {
  const {
    map: persistedMap,
    loading: loadingMap,
    error: persistenceError,
    refetchMap,
    saveMap,
    resetMap,
    isSaving: savingMap,
    isResetting: resettingMap,
  } = useClientOnboardingMojoMap({ mapId: CLIENT_ONBOARDING_MOJOMAP_ID, enabled: true });
  const [draft, setDraft] = useState<OnboardingMapConfig>(persistedMap);
  const [mode, setMode] = useState<"edit" | "preview">("edit");
  const [savedSnapshot, setSavedSnapshot] = useState<string>(JSON.stringify(persistedMap));
  const [errors, setErrors] = useState<string[]>([]);
  const [operationError, setOperationError] = useState<string | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);

  const dirty = useMemo(() => JSON.stringify(draft) !== savedSnapshot, [draft, savedSnapshot]);
  const ownershipScoreModel = useMemo(() => getOnboardingOwnershipScoreModel(draft), [draft]);
  const busy = loadingMap || savingMap || resettingMap;
  const statusError = operationError ?? persistenceError;
  const saveStatusLabel = useMemo(() => {
    if (savingMap) return "Saving...";
    if (statusError) return "Save error";
    if (dirty) return "Pending autosave...";
    if (!lastSavedAt) return "Saved";
    const parsed = Date.parse(lastSavedAt);
    if (Number.isNaN(parsed)) return "Saved";
    return `Saved ${new Date(parsed).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
  }, [dirty, lastSavedAt, savingMap, statusError]);

  useEffect(() => {
    setDraft(persistedMap);
    setSavedSnapshot(JSON.stringify(persistedMap));
    setErrors([]);
    setOperationError(null);
    setLastSavedAt(
      Number.isNaN(Date.parse(persistedMap.updatedAt || ""))
        ? new Date().toISOString()
        : persistedMap.updatedAt,
    );
  }, [persistedMap]);

  function updateDraft(updater: (current: OnboardingMapConfig) => OnboardingMapConfig) {
    setDraft((current) => updater(cloneConfig(current)));
  }

  function updateLayer(index: number, updater: (layer: OnboardingLayer) => OnboardingLayer) {
    updateDraft((current) => {
      current.layers = current.layers.map((layer, layerIndex) =>
        layerIndex === index ? updater(layer) : layer,
      );
      return current;
    });
  }

  function updateActionGroup(
    groupId: ActionGroup["id"],
    updater: (group: ActionGroup) => ActionGroup,
  ) {
    updateDraft((current) => {
      current.actionGroups = current.actionGroups.map((group) =>
        group.id === groupId ? updater(group) : group,
      );
      return current;
    });
  }

  const persistDraft = useCallback(async (source: "manual" | "autosave") => {
    const validationErrors = validateConfig(draft);
    if (validationErrors.length) {
      if (source === "manual") {
        setErrors(validationErrors);
        toast.error("Fix validation errors before saving.");
      }
      return false;
    }

    setOperationError(null);
    try {
      const saved = await saveMap(draft);
      setDraft(saved);
      setSavedSnapshot(JSON.stringify(saved));
      setErrors([]);
      setLastSavedAt(saved.updatedAt || new Date().toISOString());
      if (source === "manual") {
        toast.success("Client Onboarding MojoMap saved.");
      }
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to save map.";
      setOperationError(message);
      if (source === "manual") {
        toast.error(message);
      }
      return false;
    }
  }, [draft, saveMap]);

  useEffect(() => {
    if (loadingMap || resettingMap || savingMap) return;
    if (!dirty) return;
    if (validateConfig(draft).length > 0) return;

    const timer = window.setTimeout(() => {
      void persistDraft("autosave");
    }, AUTOSAVE_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timer);
    };
  }, [dirty, draft, loadingMap, persistDraft, resettingMap, savingMap]);

  async function handleSave() {
    await persistDraft("manual");
  }

  async function handleDiscard() {
    setOperationError(null);
    const persisted = await refetchMap();
    setDraft(persisted);
    setSavedSnapshot(JSON.stringify(persisted));
    setErrors([]);
    setLastSavedAt(persisted.updatedAt || new Date().toISOString());
    toast.message("Unsaved changes discarded.");
  }

  async function handleResetToSeed() {
    setOperationError(null);
    try {
      const seed = await resetMap();
      setDraft(seed);
      setSavedSnapshot(JSON.stringify(seed));
      setErrors([]);
      setLastSavedAt(seed.updatedAt || new Date().toISOString());
      toast.success("Reset to seeded onboarding map.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to reset map.";
      setOperationError(message);
      toast.error(message);
    }
  }

  async function handleCopyJson() {
    const payload = JSON.stringify(draft, null, 2);
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(payload);
        toast.success("Map JSON copied.");
        return;
      }
    } catch {
      // Fallback below
    }
    toast.error("Clipboard unavailable in this browser.");
  }

  return (
    <div
      className="min-h-screen"
      style={{
        background: "#faf7f6",
        backgroundImage:
          `url("data:image/svg+xml,%3Csvg width='6' height='6' viewBox='0 0 6 6' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='%23000' fill-opacity='0.025'%3E%3Cpath d='M5 0h1L0 5V4zM6 5v1H5z'/%3E%3C/g%3E%3C/svg%3E")`,
      }}
    >
      <TopNav />
      <main className="max-w-content mx-auto w-full space-y-4 px-4 pb-10 pt-6 sm:px-6 md:px-9">
        <Card className="border-[#dce5d2] bg-white/95 shadow-sm">
          <CardHeader className="pb-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-[#6e847f]">Map Editor</p>
                <CardTitle className="text-[22px] text-[#233c4b]">Client Onboarding MojoMap</CardTitle>
                <CardDescription className="mt-1 text-[13px] text-[#46606d]">
                  Internal admin editor for this map. Changes save to the backend map store.
                </CardDescription>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={statusError || dirty || savingMap ? "secondary" : "outline"}>
                  {saveStatusLabel}
                </Badge>
                <Badge variant="outline">
                  {loadingMap ? "Loading..." : persistenceError ? "Seed fallback" : statusError ? "Action error" : "Connected"}
                </Badge>
                <Button type="button" variant="outline" size="sm" asChild>
                  <Link to={CLIENT_ONBOARDING_MOJOMAP_ROUTE}>
                    View Map
                  </Link>
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={handleCopyJson} disabled={busy}>
                  Copy JSON
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    void handleDiscard();
                  }}
                  disabled={!dirty || busy}
                >
                  Discard
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    void handleResetToSeed();
                  }}
                  disabled={busy}
                >
                  Reset To Seed
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => {
                    void handleSave();
                  }}
                  disabled={busy}
                >
                  <Save />
                  {savingMap ? "Saving..." : "Save"}
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">
                Ownership Strength {ownershipScoreModel.ownershipScore} ({ownershipScoreModel.ownershipStatusLabel})
              </Badge>
              <Badge variant="outline">
                Owned critical {ownershipScoreModel.ownedCriticalActionsCount}/{ownershipScoreModel.criticalActionsCount}
              </Badge>
              {ownershipScoreModel.unownedCriticalActionsCount > 0 ? (
                <Badge variant="secondary">
                  Unowned critical {ownershipScoreModel.unownedCriticalActionsCount}
                </Badge>
              ) : null}
            </div>
            <p className="mt-2 text-xs text-[#6e847f]">
              {ownershipScoreModel.ownershipSubscoreInsight}. One clear owner keeps momentum moving.
            </p>
          </CardContent>
          {statusError ? (
            <CardContent className="pt-0">
              <div className="rounded-md border border-amber-300/60 bg-amber-50/70 p-3 text-sm text-amber-900">
                {statusError}
              </div>
            </CardContent>
          ) : null}
          {errors.length ? (
            <CardContent className="pt-0">
              <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3">
                <p className="mb-2 text-sm font-medium text-destructive">Validation Issues</p>
                <ul className="list-disc space-y-1 pl-5 text-sm text-destructive">
                  {errors.map((error) => (
                    <li key={error}>{error}</li>
                  ))}
                </ul>
              </div>
            </CardContent>
          ) : null}
        </Card>
        <datalist id="owner-suggestions">
          {ACTION_OWNER_OPTIONS.map((owner) => (
            <option key={owner} value={owner} />
          ))}
        </datalist>

        <Tabs value={mode} onValueChange={(value) => setMode(value as "edit" | "preview")} className="space-y-3">
          <TabsList className="h-auto rounded-lg border border-[#dce5d2] bg-white/95 p-1 shadow-sm">
            <TabsTrigger value="edit" className="px-4">
              Edit Data
            </TabsTrigger>
            <TabsTrigger value="preview" className="px-4">
              Preview Map
            </TabsTrigger>
          </TabsList>

          <TabsContent value="edit" className="mt-0">
            <Accordion
              type="multiple"
              defaultValue={Array.from(EDITOR_SECTIONS)}
              className="rounded-lg border border-[#dce5d2] bg-white/95 shadow-sm"
            >
          <AccordionItem value="metadata" className="px-5 border-[#e8eee1]">
            <AccordionTrigger className="py-3 hover:no-underline">
              <div className="text-left">
                <p className="text-sm font-semibold text-[#233c4b]">Map Metadata</p>
                <p className="text-xs text-[#6e847f]">Identity, ownership, and status</p>
              </div>
            </AccordionTrigger>
            <AccordionContent>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="map-name">Name</Label>
                  <Input
                    id="map-name"
                    value={draft.name}
                    onChange={(e) => updateDraft((current) => ({ ...current, name: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="map-type">Type</Label>
                  <Input
                    id="map-type"
                    value={draft.type}
                    onChange={(e) => updateDraft((current) => ({ ...current, type: e.target.value }))}
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="map-description">Description</Label>
                  <Textarea
                    id="map-description"
                    value={draft.description}
                    onChange={(e) =>
                      updateDraft((current) => ({
                        ...current,
                        description: e.target.value,
                        purpose: e.target.value,
                      }))
                    }
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <OwnershipEditor
                    idPrefix="map"
                    ownership={draft.ownership}
                    warningText="Assign a primary owner to keep accountability clear."
                    onChange={(nextOwnership) =>
                      updateDraft((current) => ({
                        ...current,
                        ownership: nextOwnership,
                      }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="map-status">Status</Label>
                  <Select
                    value={draft.status}
                    onValueChange={(value: OnboardingMapConfig["status"]) =>
                      updateDraft((current) => ({ ...current, status: value }))
                    }
                  >
                    <SelectTrigger id="map-status">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {MAP_STATUS_OPTIONS.map((status) => (
                        <SelectItem key={status} value={status}>
                          {formatSelectLabel(status)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="outcome" className="px-5 border-[#e8eee1]">
            <AccordionTrigger className="py-3 hover:no-underline">
              <div className="text-left">
                <p className="text-sm font-semibold text-[#233c4b]">Outcome</p>
                <p className="text-xs text-[#6e847f]">Center target and success signal</p>
              </div>
            </AccordionTrigger>
            <AccordionContent>
              <div className="grid grid-cols-1 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="outcome-title">Title</Label>
                  <Input
                    id="outcome-title"
                    value={draft.outcome.title}
                    onChange={(e) =>
                      updateDraft((current) => ({
                        ...current,
                        outcome: { ...current.outcome, title: e.target.value },
                      }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="outcome-description">Description</Label>
                  <Textarea
                    id="outcome-description"
                    value={draft.outcome.description}
                    onChange={(e) =>
                      updateDraft((current) => ({
                        ...current,
                        centerOutcome: e.target.value,
                        outcome: { ...current.outcome, description: e.target.value },
                      }))
                    }
                  />
                </div>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="outcome-target-metric">Target Metric</Label>
                    <Input
                      id="outcome-target-metric"
                      value={draft.outcome.targetMetric ?? ""}
                      onChange={(e) =>
                        updateDraft((current) => ({
                          ...current,
                          outcome: { ...current.outcome, targetMetric: e.target.value },
                        }))
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="outcome-target-date">Target Date</Label>
                    <Input
                      id="outcome-target-date"
                      type="date"
                      value={draft.outcome.targetDate ?? ""}
                      onChange={(e) =>
                        updateDraft((current) => ({
                          ...current,
                          outcome: { ...current.outcome, targetDate: e.target.value },
                        }))
                      }
                    />
                  </div>
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="layers" className="px-5 border-[#e8eee1]">
            <AccordionTrigger className="py-3 hover:no-underline">
              <div className="text-left">
                <p className="text-sm font-semibold text-[#233c4b]">Layers</p>
                <p className="text-xs text-[#6e847f]">{draft.layers.length} layers in onboarding flow</p>
              </div>
            </AccordionTrigger>
            <AccordionContent>
              <div className="space-y-4">
                {draft.layers.map((layer, layerIndex) => (
                  <Card key={layer.id} className="border-[#e7eee2] bg-[#fcfdfc] shadow-none">
                    <CardHeader className="pb-3 pt-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="space-y-1">
                          <Badge variant="outline">Layer {layerIndex + 1}</Badge>
                          <p className="text-sm text-muted-foreground">{layer.id}</p>
                        </div>
                        <div className="flex items-center gap-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            aria-label={`Move layer ${layerIndex + 1} up`}
                            onClick={() =>
                              updateDraft((current) => {
                                if (layerIndex === 0) return current;
                                const copy = [...current.layers];
                                [copy[layerIndex - 1], copy[layerIndex]] = [
                                  copy[layerIndex],
                                  copy[layerIndex - 1],
                                ];
                                current.layers = copy;
                                return current;
                              })
                            }
                          >
                            Up
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            aria-label={`Move layer ${layerIndex + 1} down`}
                            onClick={() =>
                              updateDraft((current) => {
                                if (layerIndex >= current.layers.length - 1) return current;
                                const copy = [...current.layers];
                                [copy[layerIndex + 1], copy[layerIndex]] = [
                                  copy[layerIndex],
                                  copy[layerIndex + 1],
                                ];
                                current.layers = copy;
                                return current;
                              })
                            }
                          >
                            Down
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            aria-label={`Remove layer ${layerIndex + 1}`}
                            onClick={() =>
                              updateDraft((current) => {
                                if (current.layers.length <= 1) return current;
                                current.layers = current.layers.filter(
                                  (_, index) => index !== layerIndex,
                                );
                                return current;
                              })
                            }
                          >
                            Remove
                          </Button>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                        <div className="space-y-2">
                          <Label>Title</Label>
                          <Input
                            value={layer.title}
                            onChange={(e) =>
                              updateLayer(layerIndex, (current) => ({
                                ...current,
                                title: e.target.value,
                                id: slugify(current.id || e.target.value),
                              }))
                            }
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Status</Label>
                          <Select
                            value={layer.status ?? "planned"}
                            onValueChange={(value: NonNullable<OnboardingLayer["status"]>) =>
                              updateLayer(layerIndex, (current) => ({
                                ...current,
                                status: value,
                              }))
                            }
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {LAYER_STATUS_OPTIONS.map((status) => (
                                <SelectItem key={status} value={status}>
                                  {formatSelectLabel(status)}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label>Purpose</Label>
                        <Textarea
                          value={layer.purpose}
                          onChange={(e) =>
                            updateLayer(layerIndex, (current) => ({
                              ...current,
                              purpose: e.target.value,
                            }))
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Summary</Label>
                        <Textarea
                          value={layer.summary ?? ""}
                          onChange={(e) =>
                            updateLayer(layerIndex, (current) => ({
                              ...current,
                              summary: e.target.value,
                            }))
                          }
                        />
                      </div>
                      <StringListEditor
                        label="Content Items"
                        addLabel="Add content item"
                        inputAriaPrefix={`Layer ${layerIndex + 1} content item`}
                        items={layer.content}
                        onChange={(next) =>
                          updateLayer(layerIndex, (current) => ({ ...current, content: next }))
                        }
                      />
                      <StringListEditor
                        label="Inputs"
                        addLabel="Add input"
                        inputAriaPrefix={`Layer ${layerIndex + 1} input`}
                        items={layer.suggestedInputs ?? []}
                        onChange={(next) =>
                          updateLayer(layerIndex, (current) => ({
                            ...current,
                            suggestedInputs: next,
                          }))
                        }
                      />
                      <StringListEditor
                        label="Outputs"
                        addLabel="Add output"
                        inputAriaPrefix={`Layer ${layerIndex + 1} output`}
                        items={layer.outputs ?? []}
                        onChange={(next) =>
                          updateLayer(layerIndex, (current) => ({
                            ...current,
                            outputs: next,
                            outputLabel: next[0] ?? "",
                          }))
                        }
                      />
                      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                        <div className="space-y-2">
                          <Label>Score</Label>
                          <Input
                            type="number"
                            value={layer.score ?? ""}
                            onChange={(e) =>
                              updateLayer(layerIndex, (current) => ({
                                ...current,
                                score: e.target.value === "" ? undefined : Number(e.target.value),
                              }))
                            }
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Risk</Label>
                          <Input
                            value={layer.risk ?? ""}
                            onChange={(e) =>
                              updateLayer(layerIndex, (current) => ({
                                ...current,
                                risk: e.target.value,
                              }))
                            }
                          />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label>Notes</Label>
                        <Textarea
                          value={layer.notes ?? ""}
                          onChange={(e) =>
                            updateLayer(layerIndex, (current) => ({
                              ...current,
                              notes: e.target.value,
                            }))
                          }
                        />
                      </div>
                    </CardContent>
                  </Card>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  onClick={() =>
                    updateDraft((current) => {
                      current.layers = [...current.layers, createLayer(current.layers.length)];
                      return current;
                    })
                  }
                >
                  <Plus />
                  Add Layer
                </Button>
              </div>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="constraint" className="px-5 border-[#e8eee1]">
            <AccordionTrigger className="py-3 hover:no-underline">
              <div className="text-left">
                <p className="text-sm font-semibold text-[#233c4b]">Primary Constraint</p>
                <p className="text-xs text-[#6e847f]">Bottleneck definition and impact links</p>
              </div>
            </AccordionTrigger>
            <AccordionContent>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Title</Label>
                  <Input
                    value={draft.constraint.title}
                    onChange={(e) =>
                      updateDraft((current) => ({
                        ...current,
                        constraint: { ...current.constraint, title: e.target.value },
                      }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label>Description</Label>
                  <Textarea
                    value={draft.constraint.description ?? ""}
                    onChange={(e) =>
                      updateDraft((current) => ({
                        ...current,
                        constraint: { ...current.constraint, description: e.target.value },
                      }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label>Why It Matters</Label>
                  <Textarea
                    value={draft.constraint.whyItMatters ?? draft.constraint.role}
                    onChange={(e) =>
                      updateDraft((current) => ({
                        ...current,
                        constraint: {
                          ...current.constraint,
                          whyItMatters: e.target.value,
                          role: e.target.value,
                        },
                      }))
                    }
                  />
                </div>
                <StringListEditor
                  label="Symptoms"
                  addLabel="Add symptom"
                  inputAriaPrefix="Constraint symptom"
                  items={draft.constraint.symptoms}
                  onChange={(next) =>
                    updateDraft((current) => ({
                      ...current,
                      constraint: { ...current.constraint, symptoms: next },
                    }))
                  }
                />
                <div className="space-y-2">
                  <Label>Blocks (Impacted Layers)</Label>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {draft.layers.map((layer) => {
                      const checked = draft.constraint.affectedLayerIds.includes(layer.id);
                      return (
                        <label
                          key={layer.id}
                          className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm"
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() =>
                              updateDraft((current) => {
                                const currentIds = new Set(current.constraint.affectedLayerIds);
                                if (currentIds.has(layer.id)) currentIds.delete(layer.id);
                                else currentIds.add(layer.id);
                                const next = Array.from(currentIds);
                                current.constraint = {
                                  ...current.constraint,
                                  affectedLayerIds: next,
                                  blocks: next,
                                };
                                return current;
                              })
                            }
                          />
                          <span>{layer.title}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Priority</Label>
                    <Select
                      value={draft.constraint.priority ?? "highest"}
                      onValueChange={(value: NonNullable<ConstraintConfig["priority"]>) =>
                        updateDraft((current) => ({
                          ...current,
                          constraint: { ...current.constraint, priority: value },
                        }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {CONSTRAINT_PRIORITY_OPTIONS.map((priority) => (
                          <SelectItem key={priority} value={priority}>
                            {priority}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Severity</Label>
                    <Select
                      value={draft.constraint.severity ?? "high"}
                      onValueChange={(value: NonNullable<ConstraintConfig["severity"]>) =>
                        updateDraft((current) => ({
                          ...current,
                          constraint: { ...current.constraint, severity: value },
                        }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {CONSTRAINT_SEVERITY_OPTIONS.map((severity) => (
                          <SelectItem key={severity} value={severity}>
                            {severity}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Expected Lift</Label>
                  <Textarea
                    value={draft.constraint.expectedLift ?? ""}
                    onChange={(e) =>
                      updateDraft((current) => ({
                        ...current,
                        constraint: { ...current.constraint, expectedLift: e.target.value },
                      }))
                    }
                  />
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="actions" className="px-5 border-[#e8eee1]">
            <AccordionTrigger className="py-3 hover:no-underline">
              <div className="text-left">
                <p className="text-sm font-semibold text-[#233c4b]">Action System</p>
                <p className="text-xs text-[#6e847f]">Fix / Improve / Create execution queue</p>
              </div>
            </AccordionTrigger>
            <AccordionContent>
              <div className="space-y-4">
                {draft.actionGroups.map((group) => (
                  <Card key={group.id} className="border-[#e7eee2] bg-[#fcfdfc] shadow-none">
                    <CardHeader className="pb-3 pt-4">
                      <div className="flex items-center justify-between">
                        <Badge variant="outline">{group.title}</Badge>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            updateActionGroup(group.id, (currentGroup) => ({
                              ...currentGroup,
                              items: [
                                ...currentGroup.items,
                                createAction(currentGroup.id, currentGroup.items.length),
                              ],
                            }))
                          }
                        >
                          <Plus />
                          Add Action
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {group.items.map((item, itemIndex) => (
                        <div
                          key={item.id}
                          className={`rounded-md border p-3 ${
                            !item.ownership.primaryOwner.trim()
                              ? "border-amber-300/70 bg-amber-50/30"
                              : ""
                          }`}
                        >
                          <div className="mb-3 flex items-center justify-between gap-2">
                            <p className="text-sm font-medium">Action {itemIndex + 1}</p>
                          <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              aria-label={`Remove ${group.title} action ${itemIndex + 1}`}
                              onClick={() =>
                                updateActionGroup(group.id, (currentGroup) => ({
                                  ...currentGroup,
                                  items: currentGroup.items.filter(
                                    (_, currentIndex) => currentIndex !== itemIndex,
                                  ),
                                }))
                              }
                            >
                              Remove
                            </Button>
                          </div>
                          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                            <div className="space-y-2 md:col-span-2">
                              <Label>Title</Label>
                              <Input
                                value={item.title}
                                onChange={(e) =>
                                  updateActionGroup(group.id, (currentGroup) => ({
                                    ...currentGroup,
                                    items: currentGroup.items.map((currentItem, currentIndex) =>
                                      currentIndex === itemIndex
                                        ? { ...currentItem, title: e.target.value }
                                        : currentItem,
                                    ),
                                  }))
                                }
                              />
                            </div>
                            <div className="space-y-2 md:col-span-2">
                              <Label>Description</Label>
                              <Textarea
                                value={item.description ?? ""}
                                onChange={(e) =>
                                  updateActionGroup(group.id, (currentGroup) => ({
                                    ...currentGroup,
                                    items: currentGroup.items.map((currentItem, currentIndex) =>
                                      currentIndex === itemIndex
                                        ? { ...currentItem, description: e.target.value }
                                        : currentItem,
                                    ),
                                  }))
                                }
                              />
                            </div>
                            <div className="space-y-2 md:col-span-2">
                              <OwnershipEditor
                                idPrefix={`${group.id}-${item.id}`}
                                ownership={item.ownership}
                                warningText="Add a primary owner so this action does not drift."
                                onChange={(nextOwnership) =>
                                  updateActionGroup(group.id, (currentGroup) => ({
                                    ...currentGroup,
                                    items: currentGroup.items.map((currentItem, currentIndex) =>
                                      currentIndex === itemIndex
                                        ? {
                                            ...currentItem,
                                            ownership: nextOwnership,
                                          }
                                        : currentItem,
                                    ),
                                  }))
                                }
                              />
                            </div>
                            <div className="space-y-2">
                              <Label>Status</Label>
                              <Select
                                value={item.status}
                                onValueChange={(value: ActionItem["status"]) =>
                                  updateActionGroup(group.id, (currentGroup) => ({
                                    ...currentGroup,
                                    items: currentGroup.items.map((currentItem, currentIndex) =>
                                      currentIndex === itemIndex
                                        ? { ...currentItem, status: value }
                                        : currentItem,
                                    ),
                                  }))
                                }
                              >
                                <SelectTrigger>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {ACTION_STATUS_OPTIONS.map((status) => (
                                    <SelectItem key={status} value={status}>
                                      {formatSelectLabel(status)}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-2">
                              <Label>Impact</Label>
                              <Select
                                value={impactBandFromValue(item.impact)}
                                onValueChange={(value: (typeof ACTION_IMPACT_BANDS)[number]) =>
                                  updateActionGroup(group.id, (currentGroup) => ({
                                    ...currentGroup,
                                    items: currentGroup.items.map((currentItem, currentIndex) =>
                                      currentIndex === itemIndex
                                        ? {
                                            ...currentItem,
                                            impact: impactValueFromBand(value),
                                          }
                                        : currentItem,
                                    ),
                                  }))
                                }
                              >
                                <SelectTrigger>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {ACTION_IMPACT_BANDS.map((band) => (
                                    <SelectItem key={band} value={band}>
                                      {band}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-2">
                              <Label>Timeframe</Label>
                              <Select
                                value={item.timeframe ?? "next"}
                                onValueChange={(value: NonNullable<ActionItem["timeframe"]>) =>
                                  updateActionGroup(group.id, (currentGroup) => ({
                                    ...currentGroup,
                                    items: currentGroup.items.map((currentItem, currentIndex) =>
                                      currentIndex === itemIndex
                                        ? { ...currentItem, timeframe: value }
                                        : currentItem,
                                    ),
                                  }))
                                }
                              >
                                <SelectTrigger>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {ACTION_TIMEFRAME_OPTIONS.map((timeframe) => (
                                    <SelectItem key={timeframe} value={timeframe}>
                                      {timeframe}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-2 md:col-span-2">
                              <Label>Linked Layer</Label>
                              <Select
                                value={item.linkedLayerId ?? "__none__"}
                                onValueChange={(value) =>
                                  updateActionGroup(group.id, (currentGroup) => ({
                                    ...currentGroup,
                                    items: currentGroup.items.map((currentItem, currentIndex) =>
                                      currentIndex === itemIndex
                                        ? {
                                            ...currentItem,
                                            linkedLayerId:
                                              value === "__none__" ? undefined : value,
                                          }
                                        : currentItem,
                                    ),
                                  }))
                                }
                              >
                                <SelectTrigger>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="__none__">No linked layer</SelectItem>
                                  {draft.layers.map((layer) => (
                                    <SelectItem key={layer.id} value={layer.id}>
                                      {layer.title}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          </div>
                        </div>
                      ))}
                      {group.items.length === 0 ? (
                        <p className="text-sm text-muted-foreground">No actions yet.</p>
                      ) : null}
                    </CardContent>
                  </Card>
                ))}
              </div>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="score" className="px-5 border-[#e8eee1]">
            <AccordionTrigger className="py-3 hover:no-underline">
              <div className="text-left">
                <p className="text-sm font-semibold text-[#233c4b]">Score Block</p>
                <p className="text-xs text-[#6e847f]">Overall score, subscores, and top lifts</p>
              </div>
            </AccordionTrigger>
            <AccordionContent>
              <div className="space-y-4">
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Overall Score</Label>
                    <Input
                      type="number"
                      value={draft.health.overallScore}
                      onChange={(e) =>
                        updateDraft((current) => ({
                          ...current,
                          health: {
                            ...current.health,
                            overallScore: Number(e.target.value || 0),
                          },
                        }))
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Status Label</Label>
                    <Input
                      value={draft.health.statusLabel}
                      onChange={(e) =>
                        updateDraft((current) => ({
                          ...current,
                          health: { ...current.health, statusLabel: e.target.value },
                        }))
                      }
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Subscores</Label>
                  <div className="space-y-2">
                    {draft.health.subscores.map((subscore, index) => (
                      <div key={subscore.id} className="grid grid-cols-1 gap-2 md:grid-cols-[1fr_160px_auto]">
                        <Input
                          value={subscore.label}
                          aria-label={`Subscore ${index + 1} name`}
                          onChange={(e) =>
                            updateDraft((current) => ({
                              ...current,
                              health: {
                                ...current.health,
                                subscores: current.health.subscores.map((currentSubscore, subscoreIndex) =>
                                  subscoreIndex === index
                                    ? {
                                        ...currentSubscore,
                                        label: e.target.value,
                                        id: slugify(e.target.value || currentSubscore.id),
                                      }
                                    : currentSubscore,
                                ),
                              },
                            }))
                          }
                        />
                        <Input
                          type="number"
                          value={subscore.value}
                          aria-label={`Subscore ${index + 1} value`}
                          onChange={(e) =>
                            updateDraft((current) => ({
                              ...current,
                              health: {
                                ...current.health,
                                subscores: current.health.subscores.map((currentSubscore, subscoreIndex) =>
                                  subscoreIndex === index
                                    ? { ...currentSubscore, value: Number(e.target.value || 0) }
                                    : currentSubscore,
                                ),
                              },
                            }))
                          }
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          aria-label={`Remove subscore ${index + 1}`}
                          onClick={() =>
                            updateDraft((current) => ({
                              ...current,
                              health: {
                                ...current.health,
                                subscores: current.health.subscores.filter(
                                  (_, subscoreIndex) => subscoreIndex !== index,
                                ),
                              },
                            }))
                          }
                        >
                          Remove
                        </Button>
                      </div>
                    ))}
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      updateDraft((current) => ({
                        ...current,
                        health: {
                          ...current.health,
                          subscores: [
                            ...current.health.subscores,
                            createSubscore(current.health.subscores.length),
                          ],
                        },
                      }))
                    }
                  >
                    <Plus />
                    Add Subscore
                  </Button>
                </div>
                <StringListEditor
                  label="Top Lifts"
                  addLabel="Add top lift"
                  inputAriaPrefix="Top lift"
                  items={draft.health.topLifts}
                  onChange={(next) =>
                    updateDraft((current) => ({
                      ...current,
                      health: { ...current.health, topLifts: next },
                    }))
                  }
                />
              </div>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="loop" className="px-5 border-[#e8eee1]">
            <AccordionTrigger className="py-3 hover:no-underline">
              <div className="text-left">
                <p className="text-sm font-semibold text-[#233c4b]">Continuous Update Loop</p>
                <p className="text-xs text-[#6e847f]">Cadence and incoming signal updates</p>
              </div>
            </AccordionTrigger>
            <AccordionContent>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Title</Label>
                  <Input
                    value={draft.continuousUpdate.title}
                    onChange={(e) =>
                      updateDraft((current) => ({
                        ...current,
                        continuousUpdate: {
                          ...current.continuousUpdate,
                          title: e.target.value,
                        },
                      }))
                    }
                  />
                </div>
                <StringListEditor
                  label="Items"
                  addLabel="Add loop item"
                  inputAriaPrefix="Continuous update item"
                  items={draft.continuousUpdate.content}
                  onChange={(next) =>
                    updateDraft((current) => ({
                      ...current,
                      continuousUpdate: { ...current.continuousUpdate, content: next },
                    }))
                  }
                />
                <div className="space-y-2">
                  <Label>Cadence</Label>
                  <Input
                    value={draft.continuousUpdate.cadence ?? ""}
                    onChange={(e) =>
                      updateDraft((current) => ({
                        ...current,
                        continuousUpdate: {
                          ...current.continuousUpdate,
                          cadence: e.target.value,
                        },
                      }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label>Output Label</Label>
                  <Input
                    value={draft.continuousUpdate.outputLabel}
                    onChange={(e) =>
                      updateDraft((current) => ({
                        ...current,
                        continuousUpdate: {
                          ...current.continuousUpdate,
                          outputLabel: e.target.value,
                        },
                      }))
                    }
                  />
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>
            </Accordion>
          </TabsContent>

          <TabsContent value="preview" className="mt-0">
            <Card className="overflow-hidden border-[#dce5d2] bg-white/95 shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base text-[#233c4b]">Map Preview</CardTitle>
                <CardDescription className="text-[13px] text-[#46606d]">
                  Preview uses the saved map state from persistence.
                </CardDescription>
                {dirty ? (
                  <p className="text-xs text-[#6e847f]">
                    Unsaved edits are in the form. Save to update this preview.
                  </p>
                ) : null}
              </CardHeader>
              <CardContent className="p-0">
                <ClientOnboardingMojoMapView configOverride={persistedMap} embedded />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}

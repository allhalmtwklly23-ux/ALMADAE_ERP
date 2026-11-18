"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { hasErpPermission, useErpSession } from "@/components/erp-session-provider";
import {
  buildOrganizationTree,
  filterOrganizationTree,
  getActiveOrganizationRelationships,
  validateOrganizationRelationshipDraft,
  type OrganizationRelationshipIssue,
  type OrganizationTreeNode,
} from "@/lib/erp/organization-structure";

type CatalogKind = "unitType" | "structureType" | "unit";
type CatalogEntry = {
  id: string;
  code: string;
  nameAr: string;
  nameEn: string | null;
  status: "active" | "inactive" | "archived";
  createdAt: string;
  updatedAt: string;
};
type UnitEntry = CatalogEntry & { unitTypeId: string };
type StructureTypeEntry = CatalogEntry & { allowsMultipleParents: boolean };
type RelationshipEntry = {
  id: string;
  structureTypeId: string;
  parentUnitId: string;
  childUnitId: string;
  validFrom: string;
  validTo: string | null;
  sourceEntity: string | null;
  sourceRecordId: string | null;
  approvedByUserId: string | null;
  createdByUserId: string | null;
  createdAt: string;
};
type RelationshipDraft = {
  structureTypeId: string;
  parentUnitId: string;
  childUnitId: string;
  validFrom: string;
};
type RelationshipClosure = { id: string; validTo: string };
type OrganizationData = {
  unitTypes: CatalogEntry[];
  structureTypes: StructureTypeEntry[];
  units: UnitEntry[];
  relationships: RelationshipEntry[];
};
type ApiResult<T> = { success?: boolean; message?: string; data?: T };
type TabKey = "units" | "unitTypes" | "structureTypes" | "relationships";
type EditorState = {
  kind: CatalogKind;
  id?: string;
  code: string;
  nameAr: string;
  nameEn: string;
  unitTypeId: string;
  allowsMultipleParents: boolean;
  status: CatalogEntry["status"];
};

const EMPTY_DATA: OrganizationData = {
  unitTypes: [],
  structureTypes: [],
  units: [],
  relationships: [],
};
const TABS: { key: TabKey; label: string }[] = [
  { key: "units", label: "الوحدات" },
  { key: "unitTypes", label: "أنواع الوحدات" },
  { key: "structureTypes", label: "أنواع الهياكل" },
  { key: "relationships", label: "العلاقات التنظيمية" },
];
const STATUS_LABELS: Record<CatalogEntry["status"], string> = {
  active: "نشط",
  inactive: "غير نشط",
  archived: "مؤرشف",
};
const RELATIONSHIP_ISSUE_MESSAGES: Record<OrganizationRelationshipIssue, string> = {
  incomplete: "أكمل نوع الهيكل والوحدتين وتاريخ البداية.",
  self_parent: "لا يمكن ربط الوحدة بنفسها.",
  backdate_not_allowed: "لا يسمح بإضافة علاقة بتاريخ سابق.",
  cycle: "هذا التغيير ينشئ دورة في الهيكل التنظيمي.",
  data_conflict: "توجد علاقات متداخلة غير متوافقة لهذه الوحدة.",
  already_active: "العلاقة نفسها موجودة ونافذة في التاريخ المحدد.",
  future_conflict: "يتعارض التغيير مع علاقة مستقبلية محفوظة.",
};

function createEditor(kind: CatalogKind, unitTypeId = ""): EditorState {
  return {
    kind,
    code: "",
    nameAr: "",
    nameEn: "",
    unitTypeId,
    allowsMultipleParents: false,
    status: "active",
  };
}

function includesSearch(values: Array<string | null | undefined>, query: string) {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  return !normalizedQuery || values.some((value) =>
    String(value ?? "").toLocaleLowerCase().includes(normalizedQuery)
  );
}

export function OrganizationWorkspace() {
  const { user } = useErpSession();
  return <OrganizationWorkspaceInner key={`${user?.companyId ?? "local"}:${user?.id ?? "none"}`} />;
}

function OrganizationWorkspaceInner() {
  const { user } = useErpSession();
  const [data, setData] = useState<OrganizationData>(EMPTY_DATA);
  const [activeTab, setActiveTab] = useState<TabKey>("units");
  const [search, setSearch] = useState("");
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [relationshipDraft, setRelationshipDraft] = useState<RelationshipDraft | null>(null);
  const [closingRelationship, setClosingRelationship] = useState<RelationshipClosure | null>(null);
  const [treeStructureTypeId, setTreeStructureTypeId] = useState("");
  const [treeDate, setTreeDate] = useState("");
  const [todayDate, setTodayDate] = useState("");
  const [draggedUnitId, setDraggedUnitId] = useState("");
  const [loading, setLoading] = useState(true);
  const [hasLoadedData, setHasLoadedData] = useState(false);
  const [saving, setSaving] = useState(false);
  const [archivingId, setArchivingId] = useState("");
  const [relationshipSaving, setRelationshipSaving] = useState(false);
  const [endingRelationshipId, setEndingRelationshipId] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const canCreate = hasErpPermission(user, "organization", "create");
  const canEdit = hasErpPermission(user, "organization", "edit");

  const loadData = useCallback(async (signal?: AbortSignal) => {
    try {
      const response = await fetch("/api/organization", { cache: "no-store", signal });
      const result = await response.json() as ApiResult<OrganizationData>;
      if (!response.ok || !result.success || !result.data) {
        throw new Error(result.message ?? "تعذر تحميل بيانات الهيكل التنظيمي.");
      }
      setData(result.data);
      setHasLoadedData(true);
      setError("");
    } catch (loadError) {
      if (signal?.aborted) return;
      setError(loadError instanceof Error ? loadError.message : "تعذر تحميل بيانات الهيكل التنظيمي.");
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void Promise.resolve().then(() => {
      if (!controller.signal.aborted) {
        const today = new Date().toISOString().slice(0, 10);
        setTodayDate(today);
        setTreeDate(today);
      }
      return loadData(controller.signal);
    });
    return () => controller.abort();
  }, [loadData]);

  const activeUnitTypes = useMemo(
    () => data.unitTypes.filter((item) => item.status === "active"),
    [data.unitTypes],
  );
  const activeStructureTypes = useMemo(
    () => data.structureTypes.filter((item) => item.status === "active"),
    [data.structureTypes],
  );
  const activeUnits = useMemo(
    () => data.units.filter((item) => item.status === "active"),
    [data.units],
  );
  const selectedTreeStructureType = activeStructureTypes.find((item) => item.id === treeStructureTypeId)
    ?? activeStructureTypes[0];
  const treeRelationships = useMemo(
    () => selectedTreeStructureType
      ? getActiveOrganizationRelationships(data.relationships, selectedTreeStructureType.id, treeDate)
      : [],
    [data.relationships, selectedTreeStructureType, treeDate],
  );
  const organizationTree = useMemo(
    () => buildOrganizationTree(data.units, treeRelationships),
    [data.units, treeRelationships],
  );
  const filteredOrganizationTree = useMemo(
    () => filterOrganizationTree(organizationTree, search),
    [organizationTree, search],
  );
  const relationshipPreview = useMemo(() => {
    if (!relationshipDraft) return null;
    const structureType = activeStructureTypes.find((item) => item.id === relationshipDraft.structureTypeId);
    return validateOrganizationRelationshipDraft(
      relationshipDraft,
      structureType,
      data.relationships,
      todayDate,
    );
  }, [activeStructureTypes, data.relationships, relationshipDraft, todayDate]);
  const unitTypeNames = useMemo(
    () => new Map(data.unitTypes.map((item) => [item.id, item.nameAr])),
    [data.unitTypes],
  );
  const structureTypeNames = useMemo(
    () => new Map(data.structureTypes.map((item) => [item.id, item.nameAr])),
    [data.structureTypes],
  );
  const unitCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const unit of data.units) {
      counts.set(unit.unitTypeId, (counts.get(unit.unitTypeId) ?? 0) + 1);
    }
    return counts;
  }, [data.units]);
  const unitNames = useMemo(
    () => new Map(data.units.map((item) => [item.id, item.nameAr])),
    [data.units],
  );

  const filteredUnitTypes = useMemo(
    () => data.unitTypes.filter((item) => includesSearch([item.code, item.nameAr, item.nameEn, item.status], search)),
    [data.unitTypes, search],
  );
  const filteredStructureTypes = useMemo(
    () => data.structureTypes.filter((item) => includesSearch([item.code, item.nameAr, item.nameEn, item.status], search)),
    [data.structureTypes, search],
  );
  const filteredUnits = useMemo(
    () => data.units.filter((item) => includesSearch([
      item.code, item.nameAr, item.nameEn, item.status, unitTypeNames.get(item.unitTypeId),
    ], search)),
    [data.units, search, unitTypeNames],
  );
  const filteredRelationships = useMemo(
    () => data.relationships.filter((item) => includesSearch([
      structureTypeNames.get(item.structureTypeId),
      unitNames.get(item.parentUnitId),
      unitNames.get(item.childUnitId),
      item.validFrom,
      item.validTo,
    ], search)),
    [data.relationships, search, structureTypeNames, unitNames],
  );

  const openNewEditor = (kind: CatalogKind) => {
    setMessage("");
    setError("");
    setRelationshipDraft(null);
    setEditor(createEditor(kind, activeUnitTypes[0]?.id ?? ""));
  };

  const openNewRelationship = () => {
    const firstUnit = activeUnits[0];
    const secondUnit = activeUnits.find((unit) => unit.id !== firstUnit?.id);
    setMessage("");
    setError("");
    setEditor(null);
    setClosingRelationship(null);
    setRelationshipDraft({
      structureTypeId: activeStructureTypes[0]?.id ?? "",
      parentUnitId: firstUnit?.id ?? "",
      childUnitId: secondUnit?.id ?? "",
      validFrom: todayDate,
    });
  };

  const openRelationshipFromDrop = (parentUnitId: string, childUnitId: string) => {
    if (!selectedTreeStructureType || !canCreate || treeDate !== todayDate || parentUnitId === childUnitId) return;
    setError("");
    setMessage("");
    setEditor(null);
    setClosingRelationship(null);
    setRelationshipDraft({
      structureTypeId: selectedTreeStructureType.id,
      parentUnitId,
      childUnitId,
      validFrom: todayDate,
    });
  };

  const openEditEditor = (kind: CatalogKind, entry: CatalogEntry) => {
    const unit = kind === "unit" ? data.units.find((item) => item.id === entry.id) : undefined;
    const structureType = kind === "structureType"
      ? data.structureTypes.find((item) => item.id === entry.id)
      : undefined;
    setMessage("");
    setError("");
    setEditor({
      kind,
      id: entry.id,
      code: entry.code,
      nameAr: entry.nameAr,
      nameEn: entry.nameEn ?? "",
      unitTypeId: unit?.unitTypeId ?? "",
      allowsMultipleParents: structureType?.allowsMultipleParents ?? false,
      status: entry.status,
    });
  };

  const saveEntry = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editor) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/organization", {
        method: editor.id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editor),
      });
      const result = await response.json() as ApiResult<CatalogEntry>;
      if (!response.ok || !result.success) {
        throw new Error(result.message ?? "تعذر حفظ السجل.");
      }
      setEditor(null);
      setMessage(editor.id ? "تم تحديث السجل." : "تم إنشاء السجل.");
      setLoading(true);
      await loadData();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "تعذر حفظ السجل.");
    } finally {
      setSaving(false);
    }
  };

  const archiveEntry = async (kind: CatalogKind, entry: CatalogEntry) => {
    if (!window.confirm(`هل تريد أرشفة «${entry.nameAr}»؟ سيبقى محفوظًا كسجل تاريخي.`)) return;
    setArchivingId(entry.id);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/organization", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, id: entry.id, status: "archived" }),
      });
      const result = await response.json() as ApiResult<CatalogEntry>;
      if (!response.ok || !result.success) {
        throw new Error(result.message ?? "تعذرت أرشفة السجل.");
      }
      setMessage("تمت الأرشفة مع الاحتفاظ بالسجل التاريخي.");
      setLoading(true);
      await loadData();
    } catch (archiveError) {
      setError(archiveError instanceof Error ? archiveError.message : "تعذرت أرشفة السجل.");
    } finally {
      setArchivingId("");
    }
  };

  const saveRelationship = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!relationshipDraft) return;
    if (typeof relationshipPreview === "string") {
      setError(RELATIONSHIP_ISSUE_MESSAGES[relationshipPreview]);
      return;
    }
    setRelationshipSaving(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/organization", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "relationship", ...relationshipDraft }),
      });
      const result = await response.json() as ApiResult<RelationshipEntry> & { closedRelationshipIds?: string[] };
      if (!response.ok || !result.success) {
        throw new Error(result.message ?? "تعذر إنشاء العلاقة التنظيمية.");
      }
      setRelationshipDraft(null);
      setMessage(result.closedRelationshipIds?.length
        ? "تم إنشاء العلاقة وإنهاء العلاقة السابقة في تاريخ سريانها."
        : "تم إنشاء العلاقة التنظيمية.");
      setLoading(true);
      await loadData();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "تعذر إنشاء العلاقة التنظيمية.");
    } finally {
      setRelationshipSaving(false);
    }
  };

  const endRelationship = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!closingRelationship) return;
    setEndingRelationshipId(closingRelationship.id);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/organization", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "relationship", ...closingRelationship }),
      });
      const result = await response.json() as ApiResult<RelationshipEntry>;
      if (!response.ok || !result.success) {
        throw new Error(result.message ?? "تعذر إنهاء العلاقة التنظيمية.");
      }
      setClosingRelationship(null);
      setMessage("تم إنهاء العلاقة مع الاحتفاظ بسجلها التاريخي.");
      setLoading(true);
      await loadData();
    } catch (closeError) {
      setError(closeError instanceof Error ? closeError.message : "تعذر إنهاء العلاقة التنظيمية.");
    } finally {
      setEndingRelationshipId("");
    }
  };

  const counts: Record<TabKey, number> = {
    units: data.units.length,
    unitTypes: data.unitTypes.length,
    structureTypes: data.structureTypes.length,
    relationships: data.relationships.length,
  };
  const emptyMessage = loading
    ? "جارٍ تحميل السجلات..."
    : hasLoadedData
      ? "لا توجد سجلات مطابقة."
      : "تعذر تحميل السجلات من قاعدة البيانات.";

  return (
    <section className="organization-page" dir="rtl">
      <header className="organization-header">
        <div>
          <span className="organization-eyebrow">نواة المؤسسة</span>
          <h1>الهيكل التنظيمي</h1>
          <p>إدارة أنواع الوحدات، الوحدات التنظيمية، وبُنى الشركة دون حذف السجلات التاريخية.</p>
        </div>
        <div className="organization-header-mark" aria-hidden="true">⌘</div>
      </header>

      <div className="organization-stats" aria-label="ملخص الهيكل التنظيمي">
        <article><span>الوحدات</span><strong>{hasLoadedData ? data.units.length : "—"}</strong><small>إجمالي الوحدات</small></article>
        <article><span>أنواع الوحدات</span><strong>{hasLoadedData ? data.unitTypes.length : "—"}</strong><small>تعريفات قابلة للتهيئة</small></article>
        <article><span>أنواع الهياكل</span><strong>{hasLoadedData ? data.structureTypes.length : "—"}</strong><small>مثل الإداري والتشغيلي</small></article>
        <article><span>العلاقات التنظيمية</span><strong>{hasLoadedData ? data.relationships.length : "—"}</strong><small>تاريخ السريان والتغييرات</small></article>
      </div>

      {error && <p className="organization-feedback is-error" role="alert">{error}</p>}
      {message && <p className="organization-feedback is-success" role="status">{message}</p>}

      <section className="organization-panel" aria-label="بيانات الهيكل التنظيمي">
        <div className="organization-panel-heading">
          <div>
            <h2>بيانات الشركة</h2>
            <p>تُحمّل السجلات من الشركة المحددة في الجلسة الحالية.</p>
          </div>
          <button type="button" className="organization-refresh" onClick={() => { setLoading(true); void loadData(); }} disabled={loading}>
            {loading ? "جارٍ التحميل..." : "تحديث"}
          </button>
        </div>

        <div className="organization-tabs" aria-label="أقسام الهيكل التنظيمي">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              aria-pressed={activeTab === tab.key}
              className={activeTab === tab.key ? "is-active" : ""}
              onClick={() => setActiveTab(tab.key)}
            >
              {tab.label}<span>{hasLoadedData ? counts[tab.key] : "—"}</span>
            </button>
          ))}
        </div>

        <div className="organization-tools">
          <label>
            <span>بحث في السجلات</span>
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="ابحث بالاسم أو الرمز..."
            />
          </label>
          {hasLoadedData && canCreate && activeTab !== "relationships" && (
            <button
              type="button"
              className="organization-primary"
              onClick={() => openNewEditor(activeTab === "units" ? "unit" : activeTab === "unitTypes" ? "unitType" : "structureType")}
              disabled={activeTab === "units" && activeUnitTypes.length === 0}
            >
              ＋ إضافة {activeTab === "units" ? "وحدة" : activeTab === "unitTypes" ? "نوع وحدة" : "نوع هيكل"}
            </button>
          )}
          {hasLoadedData && canCreate && activeTab === "relationships" && (
            <button
              type="button"
              className="organization-primary"
              onClick={openNewRelationship}
              disabled={activeStructureTypes.length === 0 || activeUnits.length < 2}
            >
              ＋ إنشاء علاقة
            </button>
          )}
        </div>

        {activeTab === "relationships" && (
          <p className="organization-note">
            يتحقق الخادم من الدورات ذريًا. في الهيكل أحادي الأب، ينهي النظام العلاقة السابقة قبل بدء العلاقة الجديدة، ويحفظ أثر التغيير في التدقيق.
          </p>
        )}
        {hasLoadedData && canCreate && activeTab === "relationships" && (activeStructureTypes.length === 0 || activeUnits.length < 2) && (
          <p className="organization-note">أضف نوع هيكل نشطًا ووحدتين نشطتين على الأقل قبل إنشاء علاقة.</p>
        )}
        {hasLoadedData && activeTab === "units" && canCreate && activeUnitTypes.length === 0 && (
          <p className="organization-note">أنشئ نوع وحدة نشطًا أولاً حتى تتمكن من إضافة الوحدات.</p>
        )}

        {editor && (
          <form className="organization-editor" onSubmit={saveEntry}>
            <div className="organization-editor-heading">
              <div>
                <h3>{editor.id ? "تعديل سجل" : "إضافة سجل جديد"}</h3>
                <p>التغييرات تحفظ على الشركة الحالية وتُسجل في سجل التدقيق.</p>
              </div>
              <button type="button" className="organization-close" onClick={() => setEditor(null)} aria-label="إغلاق النموذج">×</button>
            </div>
            <div className="organization-form-grid">
              <label>
                <span>الرمز <b>*</b></span>
                <input required maxLength={64} value={editor.code} onChange={(event) => setEditor({ ...editor, code: event.target.value })} />
              </label>
              <label>
                <span>الاسم بالعربية <b>*</b></span>
                <input required maxLength={200} value={editor.nameAr} onChange={(event) => setEditor({ ...editor, nameAr: event.target.value })} />
              </label>
              <label>
                <span>الاسم بالإنجليزية</span>
                <input maxLength={200} value={editor.nameEn} onChange={(event) => setEditor({ ...editor, nameEn: event.target.value })} />
              </label>
              {editor.kind === "unit" && (
                <label>
                  <span>نوع الوحدة <b>*</b></span>
                  <select required value={editor.unitTypeId} onChange={(event) => setEditor({ ...editor, unitTypeId: event.target.value })}>
                    <option value="">اختر نوعًا</option>
                    {activeUnitTypes.map((item) => <option key={item.id} value={item.id}>{item.nameAr} — {item.code}</option>)}
                  </select>
                </label>
              )}
              {editor.kind === "structureType" && (
                <label className="organization-checkbox">
                  <input
                    type="checkbox"
                    checked={editor.allowsMultipleParents}
                    onChange={(event) => setEditor({ ...editor, allowsMultipleParents: event.target.checked })}
                  />
                  <span>يسمح بأكثر من أب (للهياكل المصفوفية)</span>
                </label>
              )}
              {editor.id && (
                <label>
                  <span>الحالة</span>
                  <select value={editor.status} onChange={(event) => setEditor({ ...editor, status: event.target.value as EditorState["status"] })}>
                    <option value="active">نشط</option>
                    <option value="inactive">غير نشط</option>
                    <option value="archived">مؤرشف</option>
                  </select>
                </label>
              )}
            </div>
            <div className="organization-form-actions">
              <button type="button" className="organization-secondary" onClick={() => setEditor(null)} disabled={saving}>إلغاء</button>
              <button type="submit" className="organization-primary" disabled={saving || !canCreate && !editor.id || !canEdit && Boolean(editor.id)}>
                {saving ? "جارٍ الحفظ..." : editor.id ? "حفظ التعديلات" : "إنشاء"}
              </button>
            </div>
          </form>
        )}
        {relationshipDraft && (
          <form className="organization-editor" onSubmit={saveRelationship}>
            <div className="organization-editor-heading">
              <div>
                <h3>إنشاء علاقة تنظيمية</h3>
                <p>تُفحص الدورة والتعارضات قبل الحفظ، مع إعادة التحقق الذري على الخادم.</p>
              </div>
              <button type="button" className="organization-close" onClick={() => setRelationshipDraft(null)} aria-label="إغلاق النموذج">×</button>
            </div>
            <div className="organization-form-grid">
              <label>
                <span>نوع الهيكل <b>*</b></span>
                <select
                  required
                  value={relationshipDraft.structureTypeId}
                  onChange={(event) => setRelationshipDraft({ ...relationshipDraft, structureTypeId: event.target.value })}
                >
                  <option value="">اختر نوع الهيكل</option>
                  {activeStructureTypes.map((item) => <option key={item.id} value={item.id}>{item.nameAr} — {item.code}</option>)}
                </select>
              </label>
              <label>
                <span>الوحدة الأعلى <b>*</b></span>
                <select
                  required
                  value={relationshipDraft.parentUnitId}
                  onChange={(event) => setRelationshipDraft({
                    ...relationshipDraft,
                    parentUnitId: event.target.value,
                    childUnitId: relationshipDraft.childUnitId === event.target.value ? "" : relationshipDraft.childUnitId,
                  })}
                >
                  <option value="">اختر الوحدة الأعلى</option>
                  {activeUnits.map((item) => <option key={item.id} value={item.id}>{item.nameAr} — {item.code}</option>)}
                </select>
              </label>
              <label>
                <span>الوحدة التابعة <b>*</b></span>
                <select
                  required
                  value={relationshipDraft.childUnitId}
                  onChange={(event) => setRelationshipDraft({ ...relationshipDraft, childUnitId: event.target.value })}
                >
                  <option value="">اختر الوحدة التابعة</option>
                  {activeUnits.filter((item) => item.id !== relationshipDraft.parentUnitId)
                    .map((item) => <option key={item.id} value={item.id}>{item.nameAr} — {item.code}</option>)}
                </select>
              </label>
              <label>
                <span>تاريخ بداية السريان <b>*</b></span>
                <input
                  required
                  type="date"
                  value={relationshipDraft.validFrom}
                  onChange={(event) => setRelationshipDraft({ ...relationshipDraft, validFrom: event.target.value })}
                />
              </label>
            </div>
            {typeof relationshipPreview === "string" && (
              <p className="organization-feedback is-error" role="alert">
                {RELATIONSHIP_ISSUE_MESSAGES[relationshipPreview]}
              </p>
            )}
            {relationshipPreview && typeof relationshipPreview === "object" && (
              <p className="organization-note" role="status">
                ستنتهي العلاقة السابقة في اليوم السابق لتاريخ البداية، مع حفظها في السجل التاريخي.
              </p>
            )}
            <div className="organization-form-actions">
              <button type="button" className="organization-secondary" onClick={() => setRelationshipDraft(null)} disabled={relationshipSaving}>إلغاء</button>
              <button type="submit" className="organization-primary" disabled={relationshipSaving || !canCreate || typeof relationshipPreview === "string"}>
                {relationshipSaving ? "جارٍ الحفظ..." : "إنشاء العلاقة"}
              </button>
            </div>
          </form>
        )}

        {loading ? (
          <div className="organization-empty" role="status">جارٍ تحميل السجلات...</div>
        ) : activeTab === "units" ? (
          <div className="organization-table-wrap">
            <table className="organization-table">
              <thead><tr><th>الوحدة</th><th>الرمز</th><th>النوع</th><th>الحالة</th><th>الإجراءات</th></tr></thead>
              <tbody>
                {filteredUnits.map((item) => (
                  <tr key={item.id}>
                    <td><strong>{item.nameAr}</strong><small>{item.nameEn || "—"}</small></td>
                    <td dir="ltr">{item.code}</td>
                    <td>{unitTypeNames.get(item.unitTypeId) ?? "نوع غير معروف"}</td>
                    <td><span className={`organization-status ${item.status}`}>{STATUS_LABELS[item.status]}</span></td>
                    <td><RowActions entry={item} kind="unit" canEdit={canEdit} archivingId={archivingId} onEdit={openEditEditor} onArchive={archiveEntry} /></td>
                  </tr>
                ))}
                {filteredUnits.length === 0 && <EmptyRow columns={5} message={emptyMessage} />}
              </tbody>
            </table>
          </div>
        ) : activeTab === "unitTypes" ? (
          <div className="organization-table-wrap">
            <table className="organization-table">
              <thead><tr><th>نوع الوحدة</th><th>الرمز</th><th>الوحدات المرتبطة</th><th>الحالة</th><th>الإجراءات</th></tr></thead>
              <tbody>
                {filteredUnitTypes.map((item) => (
                  <tr key={item.id}>
                    <td><strong>{item.nameAr}</strong><small>{item.nameEn || "—"}</small></td>
                    <td dir="ltr">{item.code}</td>
                    <td>{unitCounts.get(item.id) ?? 0}</td>
                    <td><span className={`organization-status ${item.status}`}>{STATUS_LABELS[item.status]}</span></td>
                    <td><RowActions entry={item} kind="unitType" canEdit={canEdit} archivingId={archivingId} onEdit={openEditEditor} onArchive={archiveEntry} /></td>
                  </tr>
                ))}
                {filteredUnitTypes.length === 0 && <EmptyRow columns={5} message={emptyMessage} />}
              </tbody>
            </table>
          </div>
        ) : activeTab === "structureTypes" ? (
          <div className="organization-table-wrap">
            <table className="organization-table">
              <thead><tr><th>نوع الهيكل</th><th>الرمز</th><th>تعدد الآباء</th><th>الحالة</th><th>الإجراءات</th></tr></thead>
              <tbody>
                {filteredStructureTypes.map((item) => (
                  <tr key={item.id}>
                    <td><strong>{item.nameAr}</strong><small>{item.nameEn || "—"}</small></td>
                    <td dir="ltr">{item.code}</td>
                    <td>{item.allowsMultipleParents ? "مسموح" : "غير مسموح"}</td>
                    <td><span className={`organization-status ${item.status}`}>{STATUS_LABELS[item.status]}</span></td>
                    <td><RowActions entry={item} kind="structureType" canEdit={canEdit} archivingId={archivingId} onEdit={openEditEditor} onArchive={archiveEntry} /></td>
                  </tr>
                ))}
                {filteredStructureTypes.length === 0 && <EmptyRow columns={5} message={emptyMessage} />}
              </tbody>
            </table>
          </div>
        ) : (
          <>
            <section className="organization-tree-panel" aria-label="العرض الشجري للهيكل التنظيمي">
              <div className="organization-tree-heading">
                <div>
                  <h3>البنية النافذة</h3>
                  <p>
                    استعرض التبعية حسب نوع الهيكل والتاريخ، واستخدم البحث لتصفية الفروع.
                    {canCreate && treeDate === todayDate
                      ? selectedTreeStructureType?.allowsMultipleParents
                        ? " اسحب وحدة إلى وحدة أعلى لإضافة ارتباط، ثم راجع التغيير قبل الحفظ."
                        : " اسحب وحدة إلى وحدة أعلى لاقتراح نقلها، ثم راجع التغيير قبل الحفظ."
                      : ""}
                  </p>
                </div>
                <div className="organization-tree-filters">
                  <label>
                    <span>نوع الهيكل</span>
                    <select
                      aria-label="نوع الهيكل للعرض الشجري"
                      value={selectedTreeStructureType?.id ?? ""}
                      onChange={(event) => setTreeStructureTypeId(event.target.value)}
                    >
                      {activeStructureTypes.map((item) => <option key={item.id} value={item.id}>{item.nameAr}</option>)}
                    </select>
                  </label>
                  <label>
                    <span>ساري بتاريخ</span>
                    <input
                      aria-label="تاريخ عرض الهيكل التنظيمي"
                      type="date"
                      value={treeDate}
                      onChange={(event) => setTreeDate(event.target.value)}
                    />
                  </label>
                </div>
              </div>
              {selectedTreeStructureType
                ? filteredOrganizationTree.length > 0
                  ? (
                    <ul className="organization-tree" role="tree" aria-label="وحدات الهيكل التنظيمي">
                      {filteredOrganizationTree.map((node) => (
                        <OrganizationTreeBranch
                          key={node.id}
                          node={node}
                          canDrag={canCreate && treeDate === todayDate}
                          draggedUnitId={draggedUnitId}
                          onDragStart={setDraggedUnitId}
                          onDragEnd={() => setDraggedUnitId("")}
                          onDrop={openRelationshipFromDrop}
                        />
                      ))}
                    </ul>
                  )
                  : <div className="organization-empty">لا توجد وحدات مطابقة لهذا التاريخ أو البحث.</div>
                : <div className="organization-empty">أضف نوع هيكل نشطًا لعرض الشجرة.</div>}
            </section>
            <div className="organization-table-wrap">
              <table className="organization-table">
                <thead><tr><th>نوع الهيكل</th><th>الوحدة الأعلى</th><th>الوحدة التابعة</th><th>من</th><th>إلى</th><th>الإجراءات</th></tr></thead>
                <tbody>
                  {filteredRelationships.map((item) => (
                    <tr key={item.id}>
                      <td>{structureTypeNames.get(item.structureTypeId) ?? "نوع غير معروف"}</td>
                      <td>{unitNames.get(item.parentUnitId) ?? item.parentUnitId}</td>
                      <td>{unitNames.get(item.childUnitId) ?? item.childUnitId}</td>
                      <td dir="ltr">{item.validFrom}</td>
                      <td dir="ltr">{item.validTo ?? "مستمرة"}</td>
                      <td>
                        {item.validTo
                          ? <span className="organization-readonly">منتهية</span>
                          : canEdit && closingRelationship?.id === item.id
                            ? (
                              <form className="organization-end-form" onSubmit={endRelationship}>
                                <input
                                  aria-label="تاريخ نهاية العلاقة"
                                  required
                                  type="date"
                                  value={closingRelationship.validTo}
                                  onChange={(event) => setClosingRelationship({ ...closingRelationship, validTo: event.target.value })}
                                />
                                <button type="submit" disabled={endingRelationshipId === item.id}>حفظ</button>
                                <button type="button" onClick={() => setClosingRelationship(null)} disabled={endingRelationshipId === item.id}>إلغاء</button>
                              </form>
                            )
                            : canEdit
                              ? <button type="button" className="organization-row-action" onClick={() => {
                                const today = new Date().toISOString().slice(0, 10);
                                setClosingRelationship({ id: item.id, validTo: today >= item.validFrom ? today : item.validFrom });
                              }}>إنهاء العلاقة</button>
                              : <span className="organization-readonly">عرض فقط</span>}
                      </td>
                    </tr>
                  ))}
                  {filteredRelationships.length === 0 && <EmptyRow columns={6} message={emptyMessage} />}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>
    </section>
  );
}

function OrganizationTreeBranch({
  node,
  canDrag,
  draggedUnitId,
  onDragStart,
  onDragEnd,
  onDrop,
}: {
  node: OrganizationTreeNode;
  canDrag: boolean;
  draggedUnitId: string;
  onDragStart: (unitId: string) => void;
  onDragEnd: () => void;
  onDrop: (parentUnitId: string, childUnitId: string) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const hasChildren = node.children.length > 0;
  const canDragNode = canDrag && !node.cycleReference && !node.sharedReference;

  return (
    <li
      className="organization-tree-branch"
      role="treeitem"
      aria-selected={false}
      aria-expanded={hasChildren ? expanded : undefined}
    >
      <div
        className={`organization-tree-node${node.cycleReference ? " is-cycle" : ""}${canDragNode && draggedUnitId && draggedUnitId !== node.id ? " is-drop-target" : ""}`}
        draggable={canDragNode}
        onDragStart={(event) => {
          event.dataTransfer.effectAllowed = "move";
          event.dataTransfer.setData("text/plain", node.id);
          onDragStart(node.id);
        }}
        onDragEnd={onDragEnd}
        onDragOver={(event) => {
          if (canDragNode && draggedUnitId && draggedUnitId !== node.id) {
            event.preventDefault();
            event.dataTransfer.dropEffect = "move";
          }
        }}
        onDrop={(event) => {
          event.preventDefault();
          event.stopPropagation();
          if (canDragNode && draggedUnitId && draggedUnitId !== node.id) {
            onDrop(node.id, draggedUnitId);
          }
          onDragEnd();
        }}
      >
        {hasChildren
          ? (
            <button
              type="button"
              className="organization-tree-toggle"
              aria-label={`${expanded ? "طي" : "فتح"} ${node.nameAr}`}
              aria-expanded={expanded}
              onClick={() => setExpanded(!expanded)}
            >
              {expanded ? "−" : "+"}
            </button>
          )
          : <span className="organization-tree-marker" aria-hidden="true">•</span>}
        <strong>{node.nameAr}</strong>
        <code dir="ltr">{node.code}</code>
        <span className={`organization-status ${node.status}`}>{STATUS_LABELS[node.status]}</span>
        {node.cycleReference && <small className="organization-tree-warning">مرجع دورة؛ يلزم تصحيح البيانات</small>}
        {node.sharedReference && <small className="organization-tree-shared">وحدة مشتركة في بنية متعددة الآباء</small>}
      </div>
      {hasChildren && expanded && (
        <ul className="organization-tree-children" role="group">
          {node.children.map((child, index) => (
            <OrganizationTreeBranch
              key={`${child.id}-${index}`}
              node={child}
              canDrag={canDrag}
              draggedUnitId={draggedUnitId}
              onDragStart={onDragStart}
              onDragEnd={onDragEnd}
              onDrop={onDrop}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

function RowActions({
  entry,
  kind,
  canEdit,
  archivingId,
  onEdit,
  onArchive,
}: {
  entry: CatalogEntry;
  kind: CatalogKind;
  canEdit: boolean;
  archivingId: string;
  onEdit: (kind: CatalogKind, entry: CatalogEntry) => void;
  onArchive: (kind: CatalogKind, entry: CatalogEntry) => void;
}) {
  if (!canEdit) return <span className="organization-readonly">عرض فقط</span>;
  return (
    <div className="organization-row-actions">
      <button type="button" onClick={() => onEdit(kind, entry)}>تعديل</button>
      {entry.status !== "archived" && (
        <button
          type="button"
          className="is-danger"
          onClick={() => void onArchive(kind, entry)}
          disabled={archivingId === entry.id}
        >
          {archivingId === entry.id ? "جارٍ..." : "أرشفة"}
        </button>
      )}
    </div>
  );
}

function EmptyRow({ columns, message }: { columns: number; message: string }) {
  return <tr><td colSpan={columns} className="organization-empty">{message}</td></tr>;
}

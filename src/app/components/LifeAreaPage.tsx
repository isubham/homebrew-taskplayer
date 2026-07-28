import { ListPlus } from "lucide-react";
import { useApp } from "../context/app-context-value";
import {
  HEALTH_AREA_KEY,
  LIFE_AREA_FALLBACK_COPY,
  RELATIONSHIPS_AREA_KEY,
  WORK_AREA_KEY,
} from "../constants";
import { LIFE_AREAS } from "../utils";
import { HealthAreaPage } from "./HealthAreaPage";
import { LifeAreaIcon } from "./life-area-icon";
import { RelationshipsAreaPage } from "./RelationshipsAreaPage";
import { StickyHeader } from "./sticky-header";
import { WorkAreaPage } from "./WorkAreaPage";
import "./life-area-page.css";

export function LifeAreaPage() {
  const { state } = useApp();
  if (state.activeAreaKey === HEALTH_AREA_KEY) return <HealthAreaPage />;
  if (state.activeAreaKey === RELATIONSHIPS_AREA_KEY) return <RelationshipsAreaPage />;
  if (state.activeAreaKey === WORK_AREA_KEY) return <WorkAreaPage />;
  return <GenericLifeAreaPage areaKey={state.activeAreaKey} />;
}

function GenericLifeAreaPage({ areaKey }) {
  const { state, helpers, actions } = useApp();
  const area = LIFE_AREAS.find((candidate) => candidate.key === areaKey);
  const lists = state.S.lists
    .filter((listItem) => listItem.lifeArea === areaKey)
    .sort((left, right) => left.order - right.order);
  if (!area) return null;

  return (
    <div className="health-area-page" style={{ "--health-area-color": area.color }}>
      <StickyHeader icon={<LifeAreaIcon areaKey={area.key} />} name={area.label} />
      <div className="hdr health-area-hero" data-tauri-drag-region>
        <div className="cover"><LifeAreaIcon areaKey={area.key} /></div>
        <div className="info">
          <small>{LIFE_AREA_FALLBACK_COPY.subtitle}</small>
          <h1>{area.label}</h1>
        </div>
      </div>
      <div className="health-area-actions">
        <button className="pill primary" type="button" onClick={() => actions.addList(area.key)}>
          <ListPlus size={16} />{LIFE_AREA_FALLBACK_COPY.addList}
        </button>
      </div>
      <section className="health-section generic-area-collections">
        <div className="health-section-heading">
          <h2>{LIFE_AREA_FALLBACK_COPY.collectionsHeading}</h2>
          <span>{lists.length}</span>
        </div>
        {lists.length ? (
          <div className="health-collection-grid">
            {lists.map((listItem) => (
              <button
                type="button"
                className="health-collection-card"
                key={listItem.id}
                onClick={() => actions.selectList(listItem.id)}
              >
                <span className="health-collection-emoji">{listItem.emoji}</span>
                <span className="health-collection-copy">
                  <strong>{listItem.name}</strong>
                  <small>{LIFE_AREA_FALLBACK_COPY.taskCount(helpers.tasksForList(listItem.id).length)}</small>
                </span>
              </button>
            ))}
          </div>
        ) : (
          <div className="health-area-empty">
            <h2>{LIFE_AREA_FALLBACK_COPY.emptyTitle}</h2>
            <p>{LIFE_AREA_FALLBACK_COPY.emptyBody}</p>
          </div>
        )}
      </section>
    </div>
  );
}

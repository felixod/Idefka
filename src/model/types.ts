// Эти типы и есть формат файла .idef. Поля не переименовывать: старые файлы должны открываться всегда.
// Меняете структуру — поднимите VERSION и добавьте миграцию в parseModel (file.ts).
// Метки «cloneapp» здесь и в ключах хранилища браузера остались от прежнего имени проекта:
// если их сменить, старые файлы перестанут открываться, а черновики и настройки пропадут.
export const FORMAT = 'cloneapp-model';
export const VERSION = 5;

export type Side = 'left' | 'top' | 'right' | 'bottom';

export type Notation = 'idef0' | 'dfd' | 'idef3' | 'bpmn' | 'epc' | 'usecase' | 'class' | 'sequence' | 'activity' | 'deployment' | 'erd';

type Idef0Kind = 'activity';
type DfdKind = 'process' | 'external' | 'store';
type Idef3Kind = 'uow' | 'junction' | 'referent';
type BpmnKind = 'task' | 'startEvent' | 'intermediateEvent' | 'endEvent' | 'gateway' | 'dataObject' | 'dataStore' | 'annotation' | 'pool' | 'lane';
type EpcKind = 'epcEvent' | 'epcFunction' | 'epcConnector' | 'orgUnit' | 'infoObject' | 'epcDocument' | 'appSystem';
type UseCaseKind = 'actor' | 'useCase' | 'systemBoundary';
type ClassKind = 'class' | 'interface' | 'enumeration';
type SequenceKind = 'lifeline' | 'actorLine' | 'activation' | 'fragment';
type ActivityKind = 'action' | 'initialNode' | 'finalNode' | 'flowFinal' | 'decision' | 'forkBar' | 'objectNode' | 'partition';
type DeploymentKind = 'deployNode' | 'device' | 'component' | 'artifact';
type ErdKind = 'entity';

export type NodeKind =
  | 'text'
  | 'umlNote'
  | Idef0Kind
  | DfdKind
  | Idef3Kind
  | BpmnKind
  | EpcKind
  | UseCaseKind
  | ClassKind
  | SequenceKind
  | ActivityKind
  | DeploymentKind
  | ErdKind;

export type EventTrigger = 'none' | 'message' | 'timer' | 'error' | 'signal' | 'terminate';
export type GatewayType = 'xor' | 'and' | 'or' | 'event';
export type JunctionType = 'and' | 'or' | 'xor';

export type Endpoint =
  | { t: 'box'; box: string; side: Side }
  | { t: 'border'; side: Side; at: number; fixed?: boolean }
  | { t: 'tap'; arrow: string; x: number; y: number }
  | { t: 'free'; x: number; y: number };

export interface Box {
  id: string;
  kind: NodeKind;
  name: string;
  note: string;
  x: number;
  y: number;
  w: number;
  h: number;
  child?: string;

  junction?: JunctionType;
  sync?: boolean;
  trigger?: EventTrigger;
  gateway?: GatewayType;

  stereotype?: string;
  attrs?: string;
  ops?: string;
  keys?: string;

  squiggleTo?: string;

  costs?: Record<string, number>;
  frequency?: number;
  duration?: number;
}

export type LinkKind =
  | 'precedence'
  | 'relation'
  | 'object'
  | 'sequence'
  | 'message'
  | 'association'
  | 'control'
  | 'info'
  | 'assign'
  | 'assoc'
  | 'directed'
  | 'include'
  | 'extend'
  | 'generalization'
  | 'realization'
  | 'dependency'
  | 'deploy'
  | 'aggregation'
  | 'composition'
  | 'anchor'
  | 'sync'
  | 'async'
  | 'reply'
  | 'flow'
  | 'identifying'
  | 'nonIdentifying';

export type Card = '1' | '01' | '1n' | '0n';

export interface Arrow {
  id: string;
  label: string;
  note: string;
  from: Endpoint;
  to: Endpoint;
  parent?: string;
  link?: LinkKind;

  bidir?: boolean;
  tunnel?: boolean;
  color?: string;
  squiggle?: boolean;

  route?: Pt[];
  labelDx?: number;
  labelDy?: number;

  mult0?: string;
  mult1?: string;
  card0?: Card;
  card1?: Card;
  seqY?: number;
}

export type DiagramStatus = 'working' | 'draft' | 'recommended' | 'publication';

export interface Diagram {
  id: string;
  notation: Notation;
  parent?: { diagram: string; box: string };
  status: DiagramStatus;
  boxes: Box[];
  arrows: Arrow[];
}

export interface CostCenter {
  id: string;
  name: string;
  note: string;
}

export interface ModelMeta {
  name: string;
  author: string;
  purpose: string;
  viewpoint: string;
  created: string;
  modified: string;
}

export interface AbcSettings {
  currency: string;
  timeUnit: string;
  centers: CostCenter[];
  show: boolean;
}

export interface OrgRole {
  id: string;
  name: string;
  grade: string;
  salaryMin: number;
  salaryMax: number;
  fte: number;
  works: string[]; // id работ модели, к которым приписана роль
  reportsTo?: string; // id роли непосредственного руководителя
  note: string;
}

/** kind: service — обслуживание (в цену договора), development — развитие (проекты), internal — обеспечение */
export type OrgDepKind = 'service' | 'development' | 'internal';

export interface OrgDepartment {
  id: string;
  name: string;
  mission: string;
  kind: OrgDepKind;
  parentId?: string; // id вышестоящего управления
  goals: string[]; // цели и задачи отдела/управления
  roles: OrgRole[];
}

export interface OrgParams {
  months: number;
  socialRate: number; // доля социальных взносов, например 0.302
  overheadRate: number; // накладные расходы от ФОТ обслуживания
  marginRate: number; // маржа в цене договора
  ticketsPerMonth: number;
  usersPerSite: number;
  ticketsPerUserPerMonth: number;
  sites: number;
}

export interface OrgData {
  departments: OrgDepartment[];
  params: OrgParams;
}

export interface Model {
  format: typeof FORMAT;
  version: number;
  meta: ModelMeta;
  abc: AbcSettings;
  org?: OrgData;
  roots: Record<Notation, string>;
  diagrams: Record<string, Diagram>;
}

export interface Pt {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

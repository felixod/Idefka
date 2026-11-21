import type { DiagramStatus, EventTrigger, GatewayType, JunctionType, NodeKind, Notation } from './types';

export interface Choice<T extends string> {
  value: T;
  label: string;
}

export interface KindInfo {
  kind: NodeKind;
  title: string;
  w: number;
  h: number;
  defaultName: string;
  decomposable: boolean;
  noName?: boolean;
  minW?: number;
  minH?: number;
}

function define(kind: NodeKind, title: string, w: number, h: number, defaultName: string, extra: Partial<KindInfo> = {}): KindInfo {
  return { kind, title, w, h, defaultName, decomposable: false, ...extra };
}

const decomposable = { decomposable: true };
const small = { minW: 24, minH: 24 };
const tiny = { noName: true, minW: 16, minH: 16 };

export const KINDS: Record<NodeKind, KindInfo> = {
  text: define('text', 'Текст', 160, 40, 'Текст'),
  umlNote: define('umlNote', 'Примечание', 160, 64, 'Примечание'),

  activity: define('activity', 'Работа', 168, 88, 'Новая работа', decomposable),

  process: define('process', 'Процесс', 152, 88, 'Новый процесс', decomposable),
  external: define('external', 'Внешняя сущность', 136, 56, 'Внешняя сущность'),
  store: define('store', 'Хранилище данных', 176, 40, 'Хранилище'),

  uow: define('uow', 'Единица работы', 152, 64, 'Новая работа', decomposable),

  orgBox: define('orgBox', 'Подразделение', 200, 64, 'Подразделение', decomposable),
  orgRole: define('orgRole', 'Должность', 176, 48, 'Должность'),
  junction: define('junction', 'Перекрёсток', 32, 72, '', { ...small, noName: true }),
  referent: define('referent', 'Объект ссылки', 128, 40, 'Объект ссылки'),

  task: define('task', 'Задача', 120, 80, 'Задача', decomposable),
  startEvent: define('startEvent', 'Начальное событие', 36, 36, '', small),
  intermediateEvent: define('intermediateEvent', 'Промежуточное событие', 36, 36, '', small),
  endEvent: define('endEvent', 'Конечное событие', 36, 36, '', small),
  gateway: define('gateway', 'Шлюз', 48, 48, '', small),
  dataObject: define('dataObject', 'Объект данных', 36, 48, 'Данные', small),
  dataStore: define('dataStore', 'Хранилище данных', 52, 48, 'База данных', small),
  annotation: define('annotation', 'Аннотация', 136, 48, 'Комментарий'),
  pool: define('pool', 'Пул', 840, 240, 'Участник'),
  lane: define('lane', 'Дорожка', 808, 120, 'Роль'),

  epcEvent: define('epcEvent', 'Событие', 144, 56, 'Событие'),
  epcFunction: define('epcFunction', 'Функция', 144, 64, 'Функция', decomposable),
  epcConnector: define('epcConnector', 'Логический оператор', 40, 40, '', { ...small, noName: true }),
  orgUnit: define('orgUnit', 'Организационная единица', 144, 56, 'Исполнитель'),
  infoObject: define('infoObject', 'Информационный объект', 128, 56, 'Данные'),
  epcDocument: define('epcDocument', 'Документ', 128, 64, 'Документ'),
  appSystem: define('appSystem', 'Прикладная система', 128, 56, 'Система'),

  actor: define('actor', 'Актёр', 40, 72, 'Пользователь', { minW: 24, minH: 40 }),
  useCase: define('useCase', 'Прецедент', 160, 64, 'Прецедент'),
  systemBoundary: define('systemBoundary', 'Граница системы', 400, 480, 'Система'),

  class: define('class', 'Класс', 176, 112, 'Класс', { minH: 48 }),
  interface: define('interface', 'Интерфейс', 176, 80, 'Интерфейс', { minH: 48 }),
  enumeration: define('enumeration', 'Перечисление', 160, 96, 'Перечисление', { minH: 48 }),

  lifeline: define('lifeline', 'Линия жизни', 128, 480, 'Объект', { minH: 96 }),
  actorLine: define('actorLine', 'Актёр', 128, 480, 'Пользователь', { minH: 120 }),
  activation: define('activation', 'Активация', 16, 96, '', { noName: true, minW: 8, minH: 16 }),
  fragment: define('fragment', 'Фрагмент', 400, 176, '[условие]'),

  action: define('action', 'Действие', 144, 56, 'Действие', decomposable),
  initialNode: define('initialNode', 'Начальный узел', 28, 28, '', tiny),
  finalNode: define('finalNode', 'Конечный узел', 32, 32, '', tiny),
  flowFinal: define('flowFinal', 'Конец потока', 28, 28, '', tiny),
  decision: define('decision', 'Решение / слияние', 48, 48, '', { ...small, noName: true }),
  forkBar: define('forkBar', 'Разветвление / соединение', 144, 8, '', { noName: true, minW: 6, minH: 6 }),
  objectNode: define('objectNode', 'Объект', 128, 48, 'Объект'),
  partition: define('partition', 'Раздел', 256, 608, 'Исполнитель'),

  deployNode: define('deployNode', 'Узел', 240, 160, 'Сервер'),
  device: define('device', 'Устройство', 208, 144, 'Устройство'),
  component: define('component', 'Компонент', 160, 64, 'Компонент'),
  artifact: define('artifact', 'Артефакт', 160, 56, 'app.jar'),

  entity: define('entity', 'Сущность', 176, 112, 'Сущность', { minH: 48 }),
};

const CONTAINERS = new Set<NodeKind>(['pool', 'lane', 'systemBoundary', 'fragment', 'partition', 'deployNode', 'device']);
const CONNECTABLE_CONTAINERS = new Set<NodeKind>(['deployNode', 'device']);
const LABEL_BELOW = new Set<NodeKind>(['startEvent', 'intermediateEvent', 'endEvent', 'gateway', 'dataObject', 'dataStore', 'actor']);
const CENTER_ANCHORED = new Set<NodeKind>([
  'startEvent',
  'intermediateEvent',
  'endEvent',
  'gateway',
  'epcConnector',
  'initialNode',
  'finalNode',
  'flowFinal',
  'decision',
  'actor',
  'useCase',
  'orgUnit',
]);
const WITH_COMPARTMENTS = new Set<NodeKind>(['class', 'interface', 'enumeration', 'entity']);

export const isContainer = (k: NodeKind) => CONTAINERS.has(k);
export const connectable = (k: NodeKind) => k !== 'text' && (!isContainer(k) || CONNECTABLE_CONTAINERS.has(k));
export const carriesContent = (k: NodeKind) => isContainer(k) && k !== 'fragment';
export const labelBelow = (k: NodeKind) => LABEL_BELOW.has(k);
export const centerAnchored = (k: NodeKind) => CENTER_ANCHORED.has(k);
export const hasCompartments = (k: NodeKind) => WITH_COMPARTMENTS.has(k);
export const isLifeline = (k: NodeKind) => k === 'lifeline' || k === 'actorLine';
export const lifelineHead = (k: NodeKind) => (k === 'actorLine' ? 68 : 40);

export interface NotationInfo {
  id: Notation;
  title: string;
  short: string;
  tab: string;
  description: string;
  kinds: NodeKind[];
  linkWord: string;
  hint: string;
}

export const NOTATIONS: Record<Notation, NotationInfo> = {
  idef0: {
    id: 'idef0',
    title: 'IDEF0 — функциональная модель',
    short: 'IDEF0',
    tab: 'Функции',
    description: 'Работы, входы, управление, выходы и механизмы.',
    kinds: ['activity', 'text'],
    linkWord: 'Стрелка',
    hint: '',
  },
  dfd: {
    id: 'dfd',
    title: 'DFD — диаграмма потоков данных',
    short: 'DFD',
    tab: 'Потоки данных',
    description: 'Процессы, внешние сущности, хранилища и потоки данных между ними.',
    kinds: ['process', 'external', 'store', 'text'],
    linkWord: 'Поток данных',
    hint: '',
  },
  idef3: {
    id: 'idef3',
    title: 'IDEF3 — описание процесса',
    short: 'IDEF3',
    tab: 'Процессы',
    description: 'Последовательность работ, перекрёстки (И, ИЛИ, исключающее ИЛИ) и объекты ссылки.',
    kinds: ['uow', 'junction', 'referent', 'text'],
    linkWord: 'Связь',
    hint: '',
  },
  bpmn: {
    id: 'bpmn',
    title: 'BPMN — бизнес-процесс',
    short: 'BPMN',
    tab: 'Бизнес-процессы',
    description: 'Задачи, события, шлюзы, данные, пулы и дорожки.',
    kinds: ['task', 'startEvent', 'intermediateEvent', 'endEvent', 'gateway', 'dataObject', 'dataStore', 'pool', 'lane', 'annotation'],
    linkWord: 'Поток',
    hint: '',
  },
  epc: {
    id: 'epc',
    title: 'EPC — событийная цепочка процесса',
    short: 'EPC',
    tab: 'Цепочки событий',
    description: 'События и функции чередуются; ветвления — через операторы И, ИЛИ, исключающее ИЛИ. Исполнители и данные — рядом с функциями.',
    kinds: ['epcEvent', 'epcFunction', 'epcConnector', 'orgUnit', 'infoObject', 'epcDocument', 'appSystem', 'text'],
    linkWord: 'Связь',
    hint: 'События и функции соединяются пунктирным потоком управления. Исполнитель, данные и система подключаются к функции сплошной линией — вид связи выбирается сам.',
  },
  orgchart: {
    id: 'orgchart',
    title: 'Орг-структура — организационная диаграмма',
    short: 'Орг',
    tab: 'Орг-структура',
    description: 'Подразделения и должности, подчинённость и исполнение работ IDEF0. Строится из раздела org автоматически и дорабатывается вручную.',
    kinds: ['orgBox', 'orgRole', 'text'],
    linkWord: 'Подчинение',
    hint: 'Подразделения соединяются подчинением. Должность тоже можно соединить с руководителем. Сгенерировать структуру из org — меню «Организация».',
  },
  usecase: {
    id: 'usecase',
    title: 'UML — диаграмма прецедентов',
    short: 'Use Case',
    tab: 'Прецеденты',
    description: 'Актёры, прецеденты, граница системы; включение, расширение и обобщение.',
    kinds: ['actor', 'useCase', 'systemBoundary', 'umlNote'],
    linkWord: 'Связь',
    hint: 'Актёр с прецедентом соединяется ассоциацией, прецеденты между собой — включением «include». Вид связи меняется справа в свойствах.',
  },
  class: {
    id: 'class',
    title: 'UML — диаграмма классов',
    short: 'Class',
    tab: 'Классы',
    description: 'Классы с атрибутами и операциями, интерфейсы, перечисления и связи между ними.',
    kinds: ['class', 'interface', 'enumeration', 'umlNote'],
    linkWord: 'Связь',
    hint: 'Атрибуты и операции класса пишутся справа в свойствах, по одному в строке. Там же — вид связи (наследование, композиция…) и кратность концов.',
  },
  sequence: {
    id: 'sequence',
    title: 'UML — диаграмма последовательности',
    short: 'Sequence',
    tab: 'Последовательность',
    description: 'Линии жизни объектов и сообщения между ними во времени.',
    kinds: ['lifeline', 'actorLine', 'activation', 'fragment', 'umlNote'],
    linkWord: 'Сообщение',
    hint: 'Потяните от пунктирной линии жизни к другой — получится сообщение. Сообщение двигается вверх и вниз мышью; бросьте его на ту же линию — будет вызов самого себя.',
  },
  activity: {
    id: 'activity',
    title: 'UML — диаграмма деятельности',
    short: 'Activity',
    tab: 'Деятельность',
    description: 'Действия, решения, параллельные ветви и разделы исполнителей.',
    kinds: ['action', 'initialNode', 'finalNode', 'flowFinal', 'decision', 'forkBar', 'objectNode', 'partition', 'umlNote'],
    linkWord: 'Поток',
    hint: 'Условия на выходах из решения пишутся в квадратных скобках, например «[да]». Полосу разветвления можно растянуть за угол.',
  },
  deployment: {
    id: 'deployment',
    title: 'UML — диаграмма развёртывания',
    short: 'Deployment',
    tab: 'Развёртывание',
    description: 'Узлы и устройства, развёрнутые на них компоненты и артефакты, каналы связи.',
    kinds: ['deployNode', 'device', 'component', 'artifact', 'umlNote'],
    linkWord: 'Связь',
    hint: 'Положите компонент или артефакт внутрь узла — он будет двигаться вместе с узлом. Узлы соединяются каналами связи.',
  },
  erd: {
    id: 'erd',
    title: 'ERD — диаграмма «сущность — связь»',
    short: 'ERD',
    tab: 'Сущности',
    description: 'Сущности с ключами и атрибутами, связи с кратностью в нотации «вороньи лапки».',
    kinds: ['entity', 'text'],
    linkWord: 'Связь',
    hint: 'Ключ и атрибуты сущности задаются справа в свойствах, по одному в строке. Кратность концов связи («один», «много») — в свойствах связи.',
  },
};

export const NOTATION_LIST = Object.keys(NOTATIONS) as Notation[];

export type NotationTab = Notation | { group: 'uml'; title: string; items: Notation[] };

export const NOTATION_TABS: NotationTab[] = [
  'idef0',
  'dfd',
  'idef3',
  'bpmn',
  'epc',
  'orgchart',
  { group: 'uml', title: 'UML', items: ['usecase', 'class', 'sequence', 'activity', 'deployment'] },
  'erd',
];

export const TRIGGERS: Record<EventTrigger, string> = {
  none: 'Простое',
  message: 'Сообщение',
  timer: 'Таймер',
  error: 'Ошибка',
  signal: 'Сигнал',
  terminate: 'Завершение',
};

export const GATEWAYS: Record<GatewayType, string> = {
  xor: 'Исключающий (X)',
  and: 'Параллельный (+)',
  or: 'Включающий (O)',
  event: 'По событию',
};

export const JUNCTIONS: Record<JunctionType, { symbol: string; title: string }> = {
  and: { symbol: '&', title: 'И' },
  or: { symbol: 'O', title: 'ИЛИ' },
  xor: { symbol: 'X', title: 'Исключающее ИЛИ' },
};

export const FRAGMENT_OPERATORS: Choice<string>[] = [
  { value: 'alt', label: 'alt — альтернатива' },
  { value: 'opt', label: 'opt — необязательно' },
  { value: 'loop', label: 'loop — цикл' },
  { value: 'par', label: 'par — параллельно' },
  { value: 'break', label: 'break — прерывание' },
  { value: 'critical', label: 'critical — критическая секция' },
  { value: 'ref', label: 'ref — ссылка на диаграмму' },
];

export const DIAGRAM_STATUSES: Choice<DiagramStatus>[] = [
  { value: 'working', label: 'Рабочая' },
  { value: 'draft', label: 'Эскиз' },
  { value: 'recommended', label: 'Рекомендовано' },
  { value: 'publication', label: 'Публикация' },
];

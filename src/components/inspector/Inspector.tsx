import type { Diagram } from '../../model/types';
import { setState, useStore, type Selection } from '../../store';
import { deleteSelection } from '../../actions';
import { Icon } from '../icons';
import { ArrowPanel } from './ArrowPanel';
import { BoxPanel } from './BoxPanel';
import { ColorPicker } from './controls';
import { DiagramPanel } from './DiagramPanel';

function SelectionPanel({ diagram, diagramId, sel }: { diagram: Diagram; diagramId: string; sel: Selection }) {
  const firstArrow = diagram.arrows.find((a) => a.id === sel.arrows[0]);
  return (
    <>
      <div className="insp-head">
        <span className="insp-kind">Выделено</span>
      </div>
      <p className="insp-title">
        Узлов: {sel.boxes.length}, стрелок: {sel.arrows.length}
      </p>
      {sel.arrows.length > 0 && <ColorPicker diagramId={diagramId} arrowIds={sel.arrows} value={firstArrow?.color} />}
      <div className="insp-actions">
        <button className="btn danger" onClick={deleteSelection}>
          <Icon.trash />
          Удалить выделенное
        </button>
      </div>
    </>
  );
}

function PanelBody() {
  const { model, diagramId, sel } = useStore();
  const diagram = model.diagrams[diagramId];
  const boxes = sel.boxes.length;
  const arrows = sel.arrows.length;

  if (boxes === 1 && !arrows) {
    const box = diagram.boxes.find((b) => b.id === sel.boxes[0]);
    return box ? <BoxPanel key={box.id} model={model} diagramId={diagramId} box={box} /> : null;
  }
  if (arrows === 1 && !boxes) {
    const arrow = diagram.arrows.find((a) => a.id === sel.arrows[0]);
    return arrow ? <ArrowPanel key={arrow.id} model={model} diagramId={diagramId} arrow={arrow} /> : null;
  }
  if (boxes || arrows) return <SelectionPanel diagram={diagram} diagramId={diagramId} sel={sel} />;
  return <DiagramPanel model={model} diagramId={diagramId} />;
}

export function Inspector() {
  const { inspectorOpen } = useStore();
  return (
    <aside
      className={'panel inspector' + (inspectorOpen ? '' : ' closed')}
      onKeyDown={(e) => e.key === 'Escape' && (e.target as HTMLElement).blur()}
    >
      <div className="insp-top">
        <button
          className="panel-collapse flip"
          title="Свернуть панель свойств"
          onClick={() => setState({ inspectorOpen: false })}
        >
          <Icon.chevron />
        </button>
      </div>
      <div className="panel-scroll insp">
        <PanelBody />
      </div>
    </aside>
  );
}

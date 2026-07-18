import { memo } from 'react';
import { Handle, Position, type NodeProps, type Node } from '@xyflow/react';
import { CompanyIcon, PersonIcon } from './icons';

export interface EntityNodeData extends Record<string, unknown> {
  kind: string; // classes: company | person | closed | branch | inactive | matrix | admin
  isPerson: boolean;
  color: string;
  ring?: string;
  radius: number;
  label: string;
  subLabel?: string;
  idLabel?: string;
  role?: string;
  main?: boolean;
  expanded: boolean;
  expanding: boolean;
  highlighted: boolean;
}

export type EntityFlowNode = Node<EntityNodeData, 'entity'>;

/** Nó circular do mapa societário — estrutura rf-entity do mockup NEXUS */
export const EntityNode = memo(({ data, selected }: NodeProps<EntityFlowNode>) => {
  const size = data.radius * 2;
  const style = {
    '--rf-radius': `${data.radius}px`,
    '--rf-size': `${size}px`,
  } as React.CSSProperties;

  return (
    <div
      className={`rf-entity ${data.kind} ${selected || data.highlighted ? 'is-selected' : ''}`}
      style={style}
    >
      <Handle type="target" id="t" position={Position.Top} className="rf-port" isConnectable={false} />
      <Handle type="source" id="s" position={Position.Top} className="rf-port" isConnectable={false} />
      <div className="rf-circle" style={{ background: data.color, borderColor: data.ring ?? data.color }}>
        {data.isPerson ? <PersonIcon /> : <CompanyIcon />}
        {!data.expanded && !data.expanding && <span className="rf-expand">+</span>}
        {data.expanding && <span className="rf-loading" />}
      </div>
      <div className={`rf-label ${data.main ? 'main' : ''}`}>
        <strong>{data.label}</strong>
        {data.subLabel && <span>{data.subLabel}</span>}
        {data.idLabel && <small>{data.idLabel}</small>}
        {data.role && <em>{data.role}</em>}
      </div>
    </div>
  );
});
EntityNode.displayName = 'EntityNode';

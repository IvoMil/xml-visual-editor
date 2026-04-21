import { ContentModelNode } from '../../shared/schema-table-renderer';

export function makeNode(overrides: Partial<ContentModelNode> & { name: string }): ContentModelNode {
  return {
    node_type: 'element',
    min_occurs: 1,
    max_occurs: 1,
    current_count: 0,
    is_satisfied: false,
    is_exhausted: false,
    can_insert: true,
    type_name: '',
    documentation: '',
    children: [],
    ...overrides,
  } as ContentModelNode;
}

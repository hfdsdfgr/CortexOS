import type { KnowledgeNode } from "./Knowledge";

export type Point = [number, number, number];
export interface EdgeVersion {
  version: number;
  fromNodeId: string;
  toNodeId: string;
  relation: string;
  active: boolean;
  changeReason: string;
  createdAt: string;
}
export interface GraphEdge {
  id: string;
  versions: EdgeVersion[];
}
export interface GraphData {
  nodes: KnowledgeNode[];
  edges: GraphEdge[];
  view: {
    revision: number;
    camera: Point;
    target: Point;
    positions: { nodeId: string; position: Point }[];
  };
}
export const relations: Record<string, string> = {
  supports: "支持",
  contradicts: "反驳",
  depends_on: "依赖",
  derived_from: "源于",
  revises: "修订",
};
export const shapes: Record<string, string> = {
  knowledge: "圆球",
  context: "方块",
  hypothesis: "菱体",
  decision: "锥体",
  evidence: "柱体",
  conflict: "八面体",
};
export function defaultPositions(
  nodes: KnowledgeNode[],
): Record<string, Point> {
  return Object.fromEntries(
    nodes.map((node, index) => {
      const angle = index * 2.399963229728653;
      const radius = index === 0 ? 0 : 3 + Math.sqrt(index) * 1.2;
      return [
        node.id,
        [
          Math.cos(angle) * radius,
          ((index % 3) - 1) * 1.7,
          Math.sin(angle) * radius,
        ] as Point,
      ];
    }),
  );
}
const entries = [
  ["项目目标", "context", "在本机保存项目讨论、知识与审核记录。"],
  ["用户访谈", "evidence", "演示资料：用户希望快速找到一项决定的依据。"],
  [
    "能查到原始出处",
    "knowledge",
    "重要知识保留最初引用的文字，可以返回原来的对话。",
  ],
  [
    "先做好知识查看和编辑",
    "decision",
    "先交付知识草稿、确认与历史，再连接图谱。",
  ],
  [
    "图谱有助于发现关联",
    "hypothesis",
    "这是待验证假设，需通过真实使用反馈评估。",
  ],
  ["视觉复杂度", "conflict", "关系探索与界面清晰之间存在取舍。"],
  ["按需展开详情", "knowledge", "默认突出画布，仅在选择节点后展示全文。"],
];
const timestamp = "2026-10-16T00:00:00Z";
export const demoContents = Object.fromEntries(
  entries.map((entry, index) => [`demo-${index}`, entry[2]]),
);
export const demoGraph: GraphData = {
  nodes: entries.map(([title, kind], index) => ({
    id: `demo-${index}`,
    workspaceId: "demo",
    title,
    kind,
    latestVersion: 1,
    effectiveVersion: kind === "hypothesis" ? null : 1,
    revision: 1,
    updatedAt: timestamp,
    sourceMessageId: null,
  })),
  edges: (
    [
      [1, 2, "supports"],
      [3, 0, "supports"],
      [3, 2, "depends_on"],
      [4, 1, "derived_from"],
      [5, 4, "contradicts"],
      [6, 5, "revises"],
      [6, 3, "supports"],
    ] as [number, number, string][]
  ).map(([from, to, relation], index) => ({
    id: `demo-edge-${index}`,
    versions: [
      {
        version: 1,
        fromNodeId: `demo-${from}`,
        toNodeId: `demo-${to}`,
        relation,
        active: true,
        changeReason: "示例关系",
        createdAt: timestamp,
      },
    ],
  })),
  view: { revision: 0, camera: [0, 9, 22], target: [0, 0, 0], positions: [] },
};

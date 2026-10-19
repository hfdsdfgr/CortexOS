import type { Message, RunDetail } from "./studio";
import type { DisplayNode, DisplayEdge } from "./GraphViewport";
import type { Point } from "./graph-data";
export interface ExecutionView {
  revision: number;
  camera: Point;
  target: Point;
}
export interface ExecutionData {
  detail: RunDetail;
  output: Message;
  view: ExecutionView;
}
export const eventLabels: Record<string, string> = {
  request_received: "收到问题",
  context_prepared: "保存上下文",
  retrieval_started: "开始检索知识",
  retrieval_completed: "知识检索完成",
  model_called: "模型调用尝试（旧记录）",
  model_inspection_started: "开始检查模型",
  model_inspection_completed: "模型检查完成",
  model_request_started: "开始请求模型",
  model_response_received: "收到模型响应",
  response_completed: "回答完成",
  run_failed: "运行失败",
  run_cancelled: "用户停止",
  run_interrupted: "恢复中断记录",
};
export const runLabels: Record<string, string> = {
  running: "进行中",
  completed: "已完成",
  failed: "失败",
  cancelled: "已停止",
  interrupted: "中断",
};
export interface TraceNode extends DisplayNode {
  content: string;
  summary?: string;
  time?: string;
  messageId?: string;
  nodeId?: string;
  version?: number;
  seq?: number;
  hash?: string;
}
export function projectExecution(data: ExecutionData) {
  const { detail, output } = data;
  const nodes: TraceNode[] = [];
  const edges: DisplayEdge[] = [];
  const positions: Record<string, Point> = {};
  const eventId = (seq: number) => `event:${seq}`;
  detail.events.forEach((event, index) => {
    const id = eventId(event.seq);
    const payload =
      event.payload && typeof event.payload === "object"
        ? (event.payload as Record<string, unknown>)
        : {};
    const descriptions: Record<string, string> = {
      request_received: "问题已保存，并创建本次运行。",
      retrieval_started: "按当前问题检索本工作区的已确认知识。",
      retrieval_completed: `检索完成：${detail.contextManifest.retrieval?.candidates.length ?? 0} 项候选，${detail.contextManifest.retrieval?.includedCount ?? 0} 项自动纳入。`,
      context_prepared: `已固定 ${(detail.contextManifest.knowledgeRefs ?? []).length} 项知识与 ${detail.contextManifest.messageRefs?.length ?? 0} 条消息。`,
      model_called: "旧记录表示开始调用尝试，不能据此确认模型已收到请求。",
      model_inspection_started: "开始检查所选本地模型。",
      model_inspection_completed: "本地模型来源检查通过。",
      model_request_started: "开始向本机模型服务发送已保存的请求。",
      model_response_received: "本机模型服务已返回成功响应。",
      response_completed: "生成已结束，回答已保存。",
      run_cancelled: "用户停止了生成，保留已收到的文字。",
      run_interrupted:
        "启动时发现上次运行未结束；此时间为恢复记录时间，实际中断时刻未知。",
    };
    const summary =
      typeof payload.errorMessage === "string"
        ? payload.errorMessage
        : (descriptions[event.kind] ?? "已保存的实际应用事件。");
    nodes.push({
      id,
      title: eventLabels[event.kind] ?? event.kind,
      kind: event.kind === "run_failed" ? "error" : "event",
      content: JSON.stringify(event.payload, null, 2),
      summary,
      time: event.occurredAt,
      seq: event.seq,
    });
    positions[id] = [index * 3.5, 0, 0];
    if (index > 0)
      edges.push({
        id: `order:${event.seq}`,
        fromNodeId: eventId(detail.events[index - 1].seq),
        toNodeId: id,
        relation: "executed_before",
      });
  });
  const prepared = detail.events.find((e) => e.kind === "context_prepared");
  const contextId = prepared ? eventId(prepared.seq) : null;
  const contextIndex = detail.events.findIndex(
    (e) => e.kind === "context_prepared",
  );
  let contextOrdinal = 0;
  const addContext = (node: TraceNode) => {
    nodes.push(node);
    positions[node.id] = [
      Math.max(0, contextIndex) * 3.5 + contextOrdinal * 2.5,
      4,
      (contextOrdinal % 2) * 2.5,
    ];
    contextOrdinal++;
    if (contextId)
      edges.push({
        id: `uses:${node.id}`,
        fromNodeId: node.id,
        toNodeId: contextId,
        relation: "included_in_context",
      });
  };
  const knowledge = detail.contextManifest.knowledgeRefs ?? [];
  knowledge.forEach((item) =>
    addContext({
      id: `knowledge:${item.nodeId}:${item.version}`,
      title: `${item.title} · v${item.version}`,
      kind: "context",
      content: item.content,
      nodeId: item.nodeId,
      version: item.version,
      hash: item.contentHash,
      summary:
        item.reason === "automatic_effective_knowledge"
          ? "自动检索纳入的生效知识"
          : "用户手动选择的生效知识",
    }),
  );
  if (detail.snapshot) {
    let referenceIndex = 0;
    detail.snapshot.request.messages.forEach((message, index) => {
      if (knowledge.length && index === 1) return;
      const reference =
        message.role === "system"
          ? null
          : detail.contextManifest.messageRefs[referenceIndex++];
      const current = index === detail.snapshot!.request.messages.length - 1;
      addContext({
        id: `message:${index}`,
        title:
          message.role === "system"
            ? "系统指令"
            : current
              ? "本次问题"
              : `历史${message.role === "user" ? "问题" : "回答"}`,
        kind: current ? "input" : "context",
        content: message.content,
        messageId: reference?.messageId,
        hash: reference?.contentHash,
      });
    });
  }
  const terminal = detail.events.find((e) =>
    [
      "response_completed",
      "run_failed",
      "run_cancelled",
      "run_interrupted",
    ].includes(e.kind),
  );
  if (output.content || terminal) {
    nodes.push({
      id: "output",
      title: `${output.status === "completed" ? "最终" : "部分"}输出`,
      kind: "output",
      content: output.content || "未保存输出文字。",
      messageId: output.id,
    });
    positions.output = [Math.max(0, detail.events.length - 1) * 3.5, -4, 0];
    if (terminal)
      edges.push({
        id: "output",
        fromNodeId: eventId(terminal.seq),
        toNodeId: "output",
        relation: "saved_output",
      });
  }
  return { nodes, edges, positions };
}

import {
  runDocxRedlineWorkerTask,
  type DocxRedlineWorkerRequest,
  type DocxRedlineWorkerResponse,
} from "./docxRedlineTask";

type WorkerScope = {
  onmessage: ((event: MessageEvent<DocxRedlineWorkerRequest>) => void) | null;
  postMessage(response: DocxRedlineWorkerResponse): void;
};

const workerScope = self as unknown as WorkerScope;
workerScope.onmessage = (event) => {
  void runDocxRedlineWorkerTask(event.data, (response) => workerScope.postMessage(response));
};

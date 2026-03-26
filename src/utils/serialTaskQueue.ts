type Task<T> = () => Promise<T>;

let tail: Promise<void> = Promise.resolve();

export const enqueueSerialTask = <T>(task: Task<T>): Promise<T> => {
  const runTask = tail.then(task, task);
  tail = runTask.then(
    () => undefined,
    () => undefined
  );
  return runTask;
};

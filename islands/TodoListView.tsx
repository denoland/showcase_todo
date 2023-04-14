import { useCallback, useEffect, useRef, useState } from "preact/hooks";
import type { TodoList, TodoListItem } from "../shared/api.ts";
import axios from "axios-web";

interface LocalMutation {
  text: string | null;
  completed: boolean;
}

export default function TodoListView(
  props: { initialData: TodoList; latency: number },
) {
  const [data, setData] = useState(props.initialData);
  const [dirty, setDirty] = useState(false);
  const localMutations = useRef(new Map<string, LocalMutation>());
  const [hasLocalMutations, setHasLocalMutations] = useState(false);
  const busy = hasLocalMutations || dirty;
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    let es = new EventSource(window.location.href);

    es.addEventListener("message", (e) => {
      const newData: TodoList = JSON.parse(e.data);
      setData(newData);
      setDirty(false);
      setAdding(false);
    });

    es.addEventListener("error", async () => {
      es.close();
      const backoff = 10000 + Math.random() * 5000;
      await new Promise((resolve) => setTimeout(resolve, backoff));
      es = new EventSource(window.location.href);
    });
  }, []);

  useEffect(() => {
    (async () => {
      while (1) {
        const mutations = Array.from(localMutations.current);
        localMutations.current = new Map();
        setHasLocalMutations(false);

        if (mutations.length) {
          setDirty(true);
          const chunkSize = 10;
          for (let i = 0; i < mutations.length; i += chunkSize) {
            const chunk = mutations.slice(i, i + chunkSize).map((
              [id, mut],
            ) => ({
              id,
              text: mut.text,
              completed: mut.completed,
            }));
            while (true) {
              try {
                await axios.post(window.location.href, chunk);
                break;
              } catch {
                await new Promise((resolve) => setTimeout(resolve, 1000));
              }
            }
          }
        }

        await new Promise((resolve) =>
          setTimeout(
            () => requestAnimationFrame(resolve), // pause when the page is hidden
            1000,
          )
        );
      }
    })();
  }, []);

  const addTodoInput = useRef<HTMLInputElement>(null);
  const addTodo = useCallback(() => {
    const value = addTodoInput.current!.value;
    if (!value) return;
    addTodoInput.current!.value = "";

    const id = generateItemId();
    localMutations.current.set(id, {
      text: value,
      completed: false,
    });
    setHasLocalMutations(true);
    setAdding(true);
  }, []);

  const saveTodo = useCallback(
    (item: TodoListItem, text: string | null, completed: boolean) => {
      localMutations.current.set(item.id!, {
        text,
        completed,
      });
      setHasLocalMutations(true);
    },
    [],
  );

  return (
    <div class="flex gap-2 w-full items-center justify-center py-4 xl:py-16 px-2">
      <div class="rounded w-full xl:max-w-xl">
        <div class="flex flex-col gap-4 pb-4">
          <div class="flex flex-row gap-2 items-center">
            <h1 class="font-bold text-xl">Todo List</h1>
            <div
              class={`inline-block h-2 w-2 ${
                busy ? "bg-yellow-600" : "bg-green-600"
              }`}
              style={{ borderRadius: "50%" }}
            >
            </div>
          </div>
          <div class="flex">
            <p class="opacity-50 text-sm">
              Share this page to collaborate with others.
            </p>
          </div>
          <div class="flex">
            <input
              class="border rounded w-full py-2 px-3 mr-4"
              placeholder="Add a todo item"
              ref={addTodoInput}
            />
            <button
              class="p-2 bg-blue-600 text-white rounded disabled:opacity-50"
              onClick={addTodo}
              disabled={adding}
            >
              Add
            </button>
          </div>
        </div>
        <div>
          {data.items.map((item) => (
            <TodoItem
              key={item.id! + ":" + item.versionstamp!}
              item={item}
              save={saveTodo}
            />
          ))}
        </div>
        <div class="pt-6 opacity-50 text-sm">
          <p>
            Initial data fetched in {props.latency}ms
          </p>
          <p>
            <a
              href="https://github.com/denoland/showcase_todo"
              class="underline"
            >
              Source code
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}

function TodoItem(
  { item, save }: {
    item: TodoListItem;
    save: (item: TodoListItem, text: string | null, completed: boolean) => void;
  },
) {
  const input = useRef<HTMLInputElement>(null);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const doSave = useCallback(() => {
    if (!input.current) return;
    setBusy(true);
    save(item, input.current.value, item.completed);
  }, [item]);
  const cancelEdit = useCallback(() => {
    if (!input.current) return;
    setEditing(false);
    input.current.value = item.text;
  }, []);
  const doDelete = useCallback(() => {
    const yes = confirm("Are you sure you want to delete this item?");
    if (!yes) return;
    setBusy(true);
    save(item, null, item.completed);
  }, [item]);
  const doSaveCompleted = useCallback((completed: boolean) => {
    setBusy(true);
    save(item, item.text, completed);
  }, [item]);

  return (
    <div
      class="flex my-2 border-b border-gray-300 items-center h-16"
      {...{ "data-item-id": item.id! }}
    >
      {editing && (
        <>
          <input
            class="border rounded w-full py-2 px-3 mr-4"
            ref={input}
            defaultValue={item.text}
          />
          <button
            class="p-2 rounded mr-2 disabled:opacity-50"
            title="Save"
            onClick={doSave}
            disabled={busy}
          >
            💾
          </button>
          <button
            class="p-2 rounded disabled:opacity-50"
            title="Cancel"
            onClick={cancelEdit}
            disabled={busy}
          >
            🚫
          </button>
        </>
      )}
      {!editing && (
        <>
          <input
            type="checkbox"
            checked={item.completed}
            disabled={busy}
            onChange={(e) => doSaveCompleted(e.currentTarget.checked)}
            class="mr-2"
          />
          <div class="flex flex-col w-full font-mono">
            <p>
              {item.text}
            </p>
            <p class="text-xs opacity-50 leading-loose">
              {new Date(item.createdAt).toISOString()}
            </p>
          </div>
          <button
            class="p-2 mr-2 disabled:opacity-50"
            title="Edit"
            onClick={() => setEditing(true)}
            disabled={busy}
          >
            ✏️
          </button>
          <button
            class="p-2 disabled:opacity-50"
            title="Delete"
            onClick={doDelete}
            disabled={busy}
          >
            🗑️
          </button>
        </>
      )}
    </div>
  );
}

function generateItemId(): string {
  return `${Date.now()}-${crypto.randomUUID()}`;
}

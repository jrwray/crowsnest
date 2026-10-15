import { localGet, localSet } from './storage.js';

// ─────────────────────────────────────────────────────────────────────────────
// TASKS
// ─────────────────────────────────────────────────────────────────────────────

const todoListEl = document.getElementById('todo-list');
const todoInputEl = document.getElementById('todo-input');
function renderTodos(todos) {
  todoListEl.innerHTML = '';
  todos.forEach((todo, i) => {
    const li = document.createElement('li'); li.className = 'todo-item';
    const cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = todo.done;
    cb.addEventListener('change', () => toggleTodo(i));
    const span = document.createElement('span'); span.className = 'todo-text' + (todo.done ? ' done' : ''); span.textContent = todo.text;
    const del = document.createElement('button'); del.className = 'list-action'; del.title = 'Delete'; del.textContent = '×';
    del.addEventListener('click', () => deleteTodo(i));
    li.append(cb, span, del); todoListEl.appendChild(li);
  });
}
export async function loadTodos() { const d = await localGet('todos'); renderTodos(d.todos ?? []); }
async function addTodo() {
  const text = todoInputEl.value.trim(); if (!text) return;
  const d = await localGet('todos'); const todos = [...(d.todos ?? []), { text, done: false }];
  await localSet({ todos }); renderTodos(todos); todoInputEl.value = '';
}
async function toggleTodo(index) {
  const d = await localGet('todos'); const todos = d.todos ?? [];
  if (!todos[index]) return; todos[index].done = !todos[index].done;
  await localSet({ todos }); renderTodos(todos);
}
async function deleteTodo(index) {
  const d = await localGet('todos'); const todos = (d.todos ?? []).filter((_, i) => i !== index);
  await localSet({ todos }); renderTodos(todos);
}
async function clearDoneTodos() {
  const d = await localGet('todos'); const todos = (d.todos ?? []).filter(t => !t.done);
  await localSet({ todos }); renderTodos(todos);
}
document.getElementById('add-todo').addEventListener('click', addTodo);
document.getElementById('clear-todo').addEventListener('click', clearDoneTodos);
todoInputEl.addEventListener('keydown', e => { if (e.key === 'Enter') addTodo(); });

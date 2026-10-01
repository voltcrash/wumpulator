# Wumpus Navigator

A Wumpus World–inspired simulator that teaches **breadth-first search (BFS)** and
**depth-first search (DFS)** through step-by-step graph exploration. It was built
for a BCA *Design and Analysis of Algorithms* assignment.

The explorer has to reach the gold in a cave of pits and one Wumpus. Every
safe cell is a graph vertex and every legal move is an edge. You pick an
algorithm and step through the search one operation at a time, watching the
queue or stack, the pseudocode and the counters change together.

## Running it

No build step, backend, account or API key is needed.

**Option 1: open the file.** Double-click `index.html`. The app uses plain
`<script>` tags, so it works from `file://`.

**Option 2: serve the folder** (recommended, matches how it was tested):

```bash
python3 -m http.server 8000      # or: npm start
# then open http://localhost:8000
```

**Run the tests** (Node 18 or newer, no dependencies to install):

```bash
npm test                         # same as: node --test tests/*.test.js
```

The fonts (Atkinson Hyperlegible and JetBrains Mono) load from Google Fonts.
Offline, the page falls back to system fonts and everything still works.

## Assumptions and scope

- **The whole map is revealed.** This is Wumpus World–*inspired*: there are no
  percepts (breeze, stench), no hidden cells and no logical inference. Those
  belong to knowledge-based agents, which are outside this assignment. The
  subject here is graph traversal.
- Pits and the Wumpus are **impassable cells**. They are not vertices.
- Moves are **up, right, down and left** only, and every move costs the same.
- Grids are square, from 4 × 4 (the default) up to 8 × 8.
- Coordinates are written `(row, column)` with `(0,0)` at the top-left.

## Using the app

### Screen layout

- **Left:** the cave board with row and column numbers, a control deck under
  it, and a short legend.
- **Right:** the current step: what happened, the queue or stack, the
  pseudocode with the running line highlighted, and the counters.
- **Below:** *How it works*, with tabs for the adjacency-list graph, search
  order vs route, cost, and a BFS vs DFS comparison.

### Choosing and editing a map

The map menu above the board loads a ready-made map, and **Random** makes a
random solvable map of the current size.

| Map | What it shows |
| --- | --- |
| Classic 4×4 | The textbook layout. Gold is 3 moves away. |
| DFS detour 5×5 | BFS finds 4 moves; DFS climbs the wall, backtracks out of a dead end, and returns 12 moves. |
| Gold next door | Gold is 1 move from the start. BFS finds it at once; DFS wanders first. |
| No path | The gold is walled off. Both searches end with **No safe path exists**. |

Choose **Edit map** to change cells. The toolbar switches to the editing
tools and a grid size picker (4 × 4 to 8 × 8). Choose **Done** when finished.

| Tool | Click on a cell to… |
| --- | --- |
| Start | move the explorer start there |
| Gold | move the gold there |
| Pit | add a pit, or remove one if the cell already has a pit |
| Wumpus | move the Wumpus there |
| Erase | remove a pit |

Every map always has exactly one start, one gold and one Wumpus. Items cannot
overlap: placing something on an occupied cell is refused with a message
explaining why. Changing the grid size keeps every item that still fits and
moves the rest to free cells.

Editing the map, loading a map, resizing or switching algorithm **clears the
current run**, so a trace can never be replayed against a map it was not
computed for.

### Playback controls

| Control | Action |
| --- | --- |
| Start / Restart | Runs the chosen algorithm on the current map and plays from step 1 |
| ▶ / ❚❚ | Play or pause. Pausing cancels the pending step. |
| ⏮ / ⏭ | Previous or next step (pauses autoplay) |
| Step slider | Jump to any step |
| Speed slider | 2 s to 0.06 s per step |
| ↺ Reset | Cancels playback and clears the run; the map stays |

Keyboard: **Space** play/pause, **←/→** previous/next, **R** reset.

### Reading the board

| Look | Meaning |
| --- | --- |
| Plain stone | Undiscovered |
| Teal with a dashed outline | Discovered and waiting in the queue (BFS) or on the stack (DFS) |
| White with a glowing orange ring | Current cell: just dequeued (BFS) or top of the stack (DFS) |
| Grey with **✓** | Processed: every neighbour has been checked |
| Gold fill and a gold line | The final route |
| Black hole / red Wumpus | Hazards (impassable) |
| Small number (top-left) | Order in which the cell was discovered |
| Faint thin lines | Parent links: the search tree built so far |

A solid teal arrow marks an edge that discovers a new cell, a dashed grey arrow
marks a neighbour that was already seen, and a dashed orange arrow marks a DFS
backtrack. A cell's full description (coordinates, state, discovery order) is
also available to screen readers.

## How the code is organised

```
index.html          page structure
css/styles.css      all styling
js/grid.js          map model, editing rules, adjacency-list builder, examples
js/algorithms.js    BFS and DFS; each records a frozen snapshot per step
js/player.js        playback controller (index, timer, play/pause/seek/reset)
js/render.js        draws a snapshot into the DOM
js/app.js           wires controls, map edits and the player together
tests/              Node test runner suites
```

Algorithm logic, playback and rendering are separate:

1. `algorithms.js` runs the real search **once** and records a snapshot after
   every meaningful operation. Each snapshot is frozen and holds the complete
   state: every cell's state, discovery order, parents, the queue or stack,
   counters, highlighted pseudocode lines, explanation and final path.
2. `player.js` only moves an index through that array. **Previous** simply
   shows an earlier snapshot, so the grid, data structure, explanation,
   counters and pseudocode are always restored exactly. Every pause, step,
   seek or reset bumps a generation counter, so a timer callback that was
   already queued can never fire after you stop it.
3. `render.js` draws whatever snapshot it is given and never changes state.

## The algorithms

### The grid as a graph

`buildGraph(map)` turns the grid into an undirected graph stored as
**adjacency lists**. Each safe cell `u` gets a list of the safe cells beside
it, always in the order **up, right, down, left**. This fixed order makes runs
reproducible. Hazards get no list at all. The *The graph* tab
shows the live adjacency list and highlights the entry being checked.

### Breadth-first search

```
BFS(G, s, goal):
  discovered[s] ← true;  parent[s] ← nil
  Q ← empty queue;  ENQUEUE(Q, s)
  while Q is not empty:
    u ← DEQUEUE(Q)
    if u = goal: return PATH(parent, u)
    for each v in Adj[u]:              // up, right, down, left
      if not discovered[v]:
        discovered[v] ← true;  parent[v] ← u
        ENQUEUE(Q, v)
  return NO PATH
```

Steps recorded: initialise, dequeue, check a neighbour that was already
discovered, discover and enqueue a neighbour, and finish (gold found or no
path). The queue tape labels the **front** and **rear**.

BFS removes cells in order of their distance from the start, so the first time
it removes the gold, the parent chain is a **shortest** path in moves.

### Depth-first search

```
DFS(G, s, goal):
  visited[s] ← true;  parent[s] ← nil
  S ← empty stack;  PUSH(S, s)
  while S is not empty:
    u ← TOP(S)                          // look, do not remove
    if u = goal: return S               // stack = route from s
    if u has an unchecked v in Adj[u]:  // up, right, down, left
      if not visited[v]:
        visited[v] ← true;  parent[v] ← u
        PUSH(S, v)                      // go deeper
    else: POP(S)                        // dead end, backtrack
  return NO PATH
```

This is the iterative form of recursive DFS. Each cell remembers how many of
its neighbours it has tried. A cell stays on the stack until all of them have
been tried, and only then is it popped. Because of this, **the visible stack is
always the exact route from the start to the current cell**, and a pop really
is a backtrack. When the gold reaches the top, the stack (bottom to top) is the
path returned.

Steps recorded: initialise, inspect the top of the stack, check an
already-visited neighbour, discover and push, backtrack (pop), and finish. The
stack tape labels the **top**.

DFS always finds a valid path if one exists, but it does **not** promise the
shortest one. When it returns a longer route, the result box says how many
moves BFS would need.

### Search order is not the route

The `#n` numbers show discovery order. Many discovered cells never appear on
the final route. The *Search order vs route* tab lists both sequences, with
the route cells highlighted.

## Complexity

Let **V** be the number of safe cells and **E** the number of edges between them.

| | BFS | DFS |
| --- | --- | --- |
| Time | O(V + E) | O(V + E) |
| Auxiliary space | O(V) | O(V) |

- **Time.** A cell is discovered at most once, so it enters the queue or stack
  at most once: O(V). Each adjacency list is scanned once from start to end,
  and the lists hold 2E entries in total: O(E).
- **Space.** `discovered`, `parent` and the queue or stack each hold at most
  V entries.
- On an n × n grid, V ≤ n² and E < 2n², so both run in O(n²).

The counters and the *Cost* tab report **operation counts** (cells discovered,
neighbour checks, largest frontier, recorded steps) next to V, E and 2E.
These come from the algorithm itself; the animation speed has no effect on
them, and the app never presents playback time as running time.

## Syllabus alignment

| Unit | Topic | Where it appears |
| --- | --- | --- |
| Unit 5 | Graph representation, adjacency lists | `buildGraph`, the *The graph* tab |
| Unit 5 | Breadth-first search | `bfs()` in `js/algorithms.js`, queue tape |
| Unit 5 | Depth-first search, backtracking | `dfs()` in `js/algorithms.js`, stack tape |
| Unit 5 | Graph traversal, shortest path in unweighted graphs | BFS path vs DFS path comparison |
| Unit 1 | Queue (FIFO) | BFS frontier, front/rear labels |
| Unit 1 | Stack (LIFO) | DFS frontier, top label, push/pop steps |
| Unit 1 | Time and space complexity | *Cost* tab: O(V + E) time, O(V) space, live counts |

## Verification

`npm test` runs 30 tests with Node's built-in runner:

- **BFS shortest path:** on 600 random maps of every size, BFS length equals an
  independent brute-force shortest distance.
- **DFS validity:** every DFS path starts at the start, ends at the gold, moves
  only between side-adjacent safe cells and never repeats a cell. On every
  step, the DFS stack is a connected route whose parent links match.
- **Unreachable goals:** both searches finish with a `nopath` step, an empty
  structure and an undiscovered gold. This includes a start sealed in by hazards.
- **Adjacent start and gold:** BFS returns the one-move path.
- **Linear work:** neighbour checks ≤ 2E, each vertex discovered once, and
  steps bounded by O(V + E).
- **Snapshots:** frozen, reproducible, and consistent with the counters.
- **Playback:** with a fake clock: pause cancels the pending tick, resume
  continues from the same step, reset cancels and clears, Previous returns the
  identical snapshot, and loading a new trace cancels the old timer.
- **Map editing:** overlap is refused, items move, pits toggle, required items
  cannot be erased, and resizing stays valid.

The app was also checked in a browser at desktop and phone widths. The checks
covered editing during playback (the run is cleared), pause and resume, reset
during playback, Previous restoring the step text, queue, counters and
highlighted line, the no-path example, and an 8 × 8 random map.

## Credits

The Wumpus World comes from Russell and Norvig, *Artificial Intelligence: A
Modern Approach*. Pseudocode style follows Cormen et al., *Introduction to
Algorithms*.

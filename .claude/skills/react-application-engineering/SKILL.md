---
name: react-application-engineering
description: >
  Designs, implements, reviews, tests, refactors, secures, and optimizes
  production React and TypeScript applications using repository-aware,
  accessibility-first, security-conscious engineering practices. Trigger on
  tasks involving React components, Hooks, TypeScript in a React app, React
  routing, state management, API integration, forms, server-state handling,
  React testing, React performance, React accessibility, React security,
  React architecture, React refactoring, React code review, React migration,
  or frontend debugging.
---

# React Application Engineering

A repository-aware procedure for React/TypeScript engineering work: discover the codebase's real conventions before writing anything, classify the task, define verifiable acceptance criteria, design the change against existing architecture, implement or review, verify with the repo's actual quality gates, and report with evidence.

Use this skill for: new features, bug fixes, refactors, code review, performance investigation, accessibility improvement, security improvement, test improvement, dependency migration, and architectural design in React codebases.

## Inputs

Accept or infer from the repository:

- Task description and acceptance criteria
- Repository root and relevant feature/directory
- Target files
- React version, build system (`package.json` + lockfile)
- TypeScript version (or confirmation the project is plain JS)
- Router, state-management system, server-state system
- Form library, validation library
- Test framework, end-to-end framework
- Browser/deployment targets
- Accessibility target (default: WCAG 2.2 AA)
- Constraints on new dependencies
- Backward-compatibility requirements

Discover missing values from the repository — read `package.json`, the lockfile, config files, and representative source files — rather than asking the user for information the codebase already answers.

## Procedure

### Phase 1 — Discover

Inspect project configuration and relevant source files (`package.json`, lockfile, `tsconfig*.json`, build config, ESLint/Prettier config, entry point, router config, state setup, API client, existing folder structure, tests, shared components, env handling, auth implementation, error-handling conventions, CI config). Build an understanding of: current architecture, existing conventions, data flow, state ownership, external boundaries, test strategy, relevant risks.

Do not assume a library is installed or guess at a version — verify.

### Phase 2 — Classify the task

Classify as one or more of: new feature, bug fix, refactor, code review, performance investigation, accessibility improvement, security improvement, test improvement, dependency migration, architectural design. The classification determines which checklists below apply.

### Phase 3 — Define acceptance criteria

Translate the request into verifiable criteria covering: expected user behavior, error behavior, loading behavior, permission behavior, accessibility behavior, data behavior, test expectations, build/lint expectations. When requirements are ambiguous, state the conservative assumption explicitly rather than guessing at business rules.

### Phase 4 — Design

Determine: ownership (which feature/module), component boundaries, state ownership, data-fetching location, validation boundaries, error representation, routing impact, accessibility implementation, testing levels, migration strategy. Prefer extending existing patterns over introducing a competing abstraction.

### Phase 5 — Implement or review

**Implementation tasks**: make focused changes; reuse existing primitives; maintain strict typing (or equivalent runtime-shape discipline in JS projects); add runtime validation at trust boundaries; add tests; avoid unrelated edits.

**Review tasks**: trace actual behavior through the code; identify concrete risks with a real failure scenario (not speculative "could theoretically" warnings); rank findings by severity; provide actionable, specific fixes.

### Phase 6 — Verify

Run the repository's actual quality gates via the shell — do not simulate or assume results:

```bash
npm run lint
npm run typecheck   # or npx tsc --noEmit, if applicable
npm run test
npm run build
```

Also verify by inspection or manual check: keyboard usage, error states, loading states, empty states, responsive behavior, authorization assumptions, runtime validation at boundaries, no exposed secrets in the diff.

### Phase 7 — Report

Give an evidence-based summary: what changed and why, commands run and their actual output/exit status, what was verified, and what remains unverified (be explicit — "no test suite exists for this feature" is a valid and honest statement).

## Decision rules

**Create a component when** it represents a meaningful UI concept, provides genuine reuse, isolates meaningful behavior, or creates a valuable testing boundary. Do not create a component merely to move five lines of static JSX.

**Create a Hook when** there is reusable stateful logic or a clear application-level capability. Do not create a Hook only to rename a direct state setter.

**Use an Effect only when**, in order:
1. Is React being synchronized with an external system? (If no, stop — you don't need an Effect.)
2. Can the value be calculated during render instead?
3. Can the action happen directly in an event handler instead?
4. Can the router or server-state layer perform the operation instead?
5. Does the Effect have correct cleanup?
6. Can an obsolete asynchronous result overwrite a newer result (race condition)?

Use an Effect only when step 1 is genuinely "yes" and no more appropriate mechanism exists from steps 2–4.

**Use global client state only when**: multiple distant parts of the app need it, it represents a cross-feature client workflow, local lifting would create excessive prop-drilling coupling, and it is not merely a duplicate of server data that a server-state layer should own.

**Add a dependency only when**: the capability is genuinely required, existing dependencies don't already provide it, a hand-rolled implementation would be risky or disproportionately complex, maintenance/security posture is acceptable, bundle cost is justified, and it matches repository standards (check `package.json` for sibling libraries in the same category first).

**Memoize only when**: a profiler or reasonable measurement identifies a real problem, referential stability is contractually required by a consumer, an expensive calculation is repeated unnecessarily, and the optimization does not significantly reduce readability. Memoization is not a substitute for fixing an unstable dependency array or a misplaced Effect.

**Choose test level by**: unit tests for pure logic (utilities, domain rules, schema transforms, reducers, state machines, error normalization); component/integration tests for user-visible feature behavior (interaction, forms, loading/error states, permission UI, navigation, cache invalidation); end-to-end tests only for critical cross-system workflows (auth, checkout, payment, account recovery, destructive actions). Test at the lowest level that gives realistic confidence without over-mocking.

## Checklists

### Component checklist
- [ ] Clear single responsibility
- [ ] Explicit typed props (or documented shape in JS)
- [ ] No prop/state mutation
- [ ] Pure rendering (no side effects during render)
- [ ] Stable keys for lists
- [ ] Semantic markup
- [ ] Keyboard support
- [ ] Loading and error states handled
- [ ] No unnecessary state
- [ ] No unnecessary Effect
- [ ] No hidden authorization assumption
- [ ] Tests cover user-visible behavior

### Hook checklist
- [ ] Name starts with `use`
- [ ] Hooks called unconditionally (Rules of Hooks)
- [ ] Focused responsibility
- [ ] Correct dependency handling
- [ ] Correct cleanup
- [ ] No stale closures
- [ ] Async work is cancellable / guards against stale results
- [ ] Minimal, focused exposed API
- [ ] Tested when logic is meaningful

### API checklist
- [ ] Typed/validated request
- [ ] Runtime-validated response (not a blind type assertion)
- [ ] Standardized error shape
- [ ] Authentication handled centrally, not per-call
- [ ] Cancellation supported where applicable (`AbortSignal`)
- [ ] No sensitive data logged
- [ ] Loading and mutation states handled
- [ ] Cache invalidation defined (if a server-state library is in use)
- [ ] Unauthorized/forbidden response handled explicitly
- [ ] Retry behavior is bounded, not infinite

### Form checklist
- [ ] Labels present and programmatically associated
- [ ] Correct input types/semantics/autocomplete
- [ ] Accessible error messages, associated with fields
- [ ] Client validation for UX + server validation as source of truth
- [ ] Submission disabled/guarded during in-flight request
- [ ] Duplicate submission prevented
- [ ] Server errors surfaced to the user, not swallowed
- [ ] Focus moved appropriately on validation failure
- [ ] Values not lost unexpectedly on error/re-render
- [ ] Sensitive field values never logged

### Security checklist
- [ ] No client-side secrets (source, env, bundle, source maps, comments)
- [ ] Backend enforces authorization; frontend checks are UX-only
- [ ] Untrusted data (API, URL params, storage, messages, uploads) validated at the boundary
- [ ] Untrusted HTML avoided, or sanitized with a maintained library + allowlist
- [ ] Redirects and external URLs validated (no open redirect, no `javascript:`)
- [ ] Sensitive data never logged (tokens, passwords, PII)
- [ ] Auth token storage matches the app's existing secure pattern
- [ ] CSRF considered if using cookie-based auth
- [ ] New dependencies reviewed for maintenance/security posture
- [ ] Error messages don't leak internals (stack traces, exception names, backend detail)

### Accessibility checklist
- [ ] Semantic HTML elements used where possible
- [ ] Accessible names on interactive elements
- [ ] Full keyboard operability
- [ ] Visible focus indicator preserved
- [ ] Logical focus order
- [ ] Dialogs trap and restore focus correctly
- [ ] Field errors associated with their inputs
- [ ] Dynamic status changes announced when necessary (live regions)
- [ ] Color is not the sole signal for state/status
- [ ] Sufficient color contrast
- [ ] Reduced-motion preference respected
- [ ] Layout tolerates zoom/text scaling; touch targets are usable

### Performance checklist
- [ ] Problem is measured, not assumed
- [ ] Rerenders inspected for the specific component in question
- [ ] Request waterfalls inspected (sequential vs. parallelizable)
- [ ] Bundle impact inspected for new dependencies
- [ ] Large lists considered for pagination/virtualization
- [ ] Images sized/optimized appropriately
- [ ] Any memoization added is justified by measurement
- [ ] Code splitting applied where it materially helps (routes, heavy/rare features)
- [ ] Context updates scoped to avoid unrelated rerenders
- [ ] No redundant/duplicate fetching

### Testing checklist
- [ ] Happy path
- [ ] Loading state
- [ ] Empty state
- [ ] Validation error
- [ ] Server error
- [ ] Permission error
- [ ] Retry behavior (if applicable)
- [ ] Keyboard-only interaction path
- [ ] Relevant race conditions (rapid input, stale responses)
- [ ] No assertions on private state or incidental markup structure

## Code-quality standards

Generated code must: match the repository's existing formatting; use descriptive names; keep functions focused; use early returns where they improve clarity; prefer immutable operations; avoid hidden global mutation; avoid unnecessary comments (default to none); add a comment only for non-obvious intent, a hidden constraint, or a workaround for a specific bug; never add a comment that merely restates the code; remove obsolete code rather than commenting it out; preserve public contracts unless a change is required; use consistent error and state models across the feature; compile cleanly under the project's actual TypeScript strictness (or run cleanly under its lint config, for JS projects).

## Completion criteria

A task is not complete until:

1. Acceptance criteria (Phase 3) are satisfied.
2. Changed code follows repository conventions discovered in Phase 1.
3. Type safety (or equivalent shape discipline) is preserved, not weakened.
4. External/untrusted data is validated at its entry boundary.
5. Loading, empty, error, and success states are handled where relevant.
6. Accessibility has been considered against the checklist above.
7. Security implications have been reviewed against the checklist above.
8. Relevant tests are added or updated (or their absence is explicitly disclosed).
9. Available quality checks (lint/typecheck/test/build) actually pass — verified by running them.
10. Unverified areas are disclosed in the report, not glossed over.
11. No unrelated changes remain in the diff.
12. The final report explains the result with evidence, not assertion.

## Reference examples

**Derived state — bad:**
```tsx
const [items, setItems] = useState(rawItems);
const [count, setCount] = useState(0);
useEffect(() => { setCount(items.length); }, [items]);
```
**Good:**
```tsx
const count = items.length;
```

**Effect cleanup — bad:**
```tsx
useEffect(() => {
  const id = setInterval(tick, 1000);
}, []);
```
**Good:**
```tsx
useEffect(() => {
  const id = setInterval(tick, 1000);
  return () => clearInterval(id);
}, []);
```

**Request cancellation / stale response — bad:**
```tsx
useEffect(() => {
  fetchUser(userId).then(setUser);
}, [userId]);
```
**Good:**
```tsx
useEffect(() => {
  const controller = new AbortController();
  fetchUser(userId, controller.signal)
    .then(setUser)
    .catch((err) => { if (err.name !== 'AbortError') setError(err); });
  return () => controller.abort();
}, [userId]);
```

**Discriminated unions — bad:**
```ts
interface State { loading: boolean; error?: Error; data?: Data; }
```
**Good:**
```ts
type State =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error'; error: Error }
  | { status: 'success'; data: Data };
```

**Runtime schema validation — bad:**
```ts
const user = (await res.json()) as User;
```
**Good:**
```ts
const raw: unknown = await res.json();
const user = UserSchema.parse(raw);
```

**Accessible buttons — bad:**
```tsx
<div className="btn" onClick={submit}>Submit</div>
```
**Good:**
```tsx
<button type="button" onClick={submit}>Submit</button>
```

**Stable list keys — bad:**
```tsx
{items.map((item, i) => <Row key={i} item={item} />)}
```
**Good:**
```tsx
{items.map((item) => <Row key={item.id} item={item} />)}
```

**Server-state usage — bad:**
```tsx
const [orders, setOrders] = useState([]);
useEffect(() => { getOrders().then(setOrders); }, []);
```
**Good (with a server-state library present):**
```tsx
const { data: orders, isLoading, error } = useQuery({
  queryKey: ['orders'],
  queryFn: getOrders,
});
```

**Form error handling — bad:**
```tsx
catch (err) { alert('Something went wrong'); }
```
**Good:**
```tsx
catch (err) {
  const appError = normalizeError(err);
  setFormError(appError.message);
  if (appError.fieldErrors) setFieldErrors(appError.fieldErrors);
}
```

**User-centered tests — bad:**
```tsx
expect(wrapper.state('isOpen')).toBe(true);
```
**Good:**
```tsx
expect(screen.getByRole('dialog', { name: /delete order/i })).toBeVisible();
```

**Safe error normalization — bad:**
```tsx
setError(err.message); // may leak backend stack trace or SQL detail
```
**Good:**
```tsx
setError(normalizeError(err).message); // mapped to a safe, user-facing message
```

**Route-level error handling — bad:**
```tsx
// no error boundary; a thrown render error blanks the whole app
```
**Good:**
```tsx
<Route
  path="/orders/:id"
  element={<OrderDetail />}
  errorElement={<OrderDetailError />}
/>
```

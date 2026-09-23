import { FormEvent, useCallback, useEffect, useState } from 'react';

export type Api = (path: string, body?: unknown, method?: string) => Promise<any>; // eslint-disable-line @typescript-eslint/no-explicit-any
type Account = {id: string; name: string; email: string; role: string; active: boolean; supervisorId: string | null};
type Category = {id: string; code: string; name: string; description: string; demoFineAmount: string; active: boolean};
type Security = {activeUsers: number; activeSessions: number; failedLoginsLast24Hours: number; permissions: Record<string, string[]>; events: {id: string; timestamp: string; action: string; entityType: string; actor: {name: string} | null}[]};
export function AdminPanel({api}: {api: Api}) {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [supervisors, setSupervisors] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [security, setSecurity] = useState<Security | null>(null);
  const [notice, setNotice] = useState('');
  const [selected, setSelected] = useState<Account | null>(null);
  const [category, setCategory] = useState<Category | null>(null);
  const [role, setRole] = useState('OFFICER');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const refresh = useCallback(async () => {
    const [users, leads, types, settings, audit] = await Promise.all([api(`/admin/users?page=${page}&q=${encodeURIComponent(q)}`), api('/admin/supervisors'), api('/admin/categories'), api('/admin/settings'), api('/admin/security')]);
    setAccounts(users.items); setTotal(users.total); setSupervisors(leads); setCategories(types); setNotice(settings.publicNotice); setSecurity(audit);
  }, [api, page, q]);
  useEffect(() => {void refresh().catch(e => setError(e.message));}, [refresh]);
  async function save(action: () => Promise<unknown>) {
    setBusy(true); setError(''); setMessage('');
    try {await action(); await refresh(); setMessage('Saved successfully.');} catch(e) {setError((e as Error).message);} finally {setBusy(false);}
  }
  function accountSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget; const data = new FormData(form);
    const password = String(data.get('password') ?? '');
    const supervisorId = String(data.get('supervisorId') ?? '');
    void save(async () => {
      await api(`/admin/users${selected ? `/${selected.id}` : ''}`, {name: data.get('name'), email: data.get('email'), role, ...(password ? {password} : {}), ...(role === 'OFFICER' && supervisorId ? {supervisorId} : {}), ...(selected ? {active: data.get('active') === 'on'} : {})}, selected ? 'PATCH' : 'POST');
      form.reset(); setSelected(null); setRole('OFFICER');
    });
  }
  function categorySubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget; const data = new FormData(form);
    void save(async () => {await api(`/admin/categories${category ? `/${category.id}` : ''}`, {code: data.get('code'), name: data.get('name'), description: data.get('description'), demoFineAmount: Number(data.get('amount')), active: data.get('active') === 'on'}, category ? 'PATCH' : 'POST'); form.reset(); setCategory(null);});
  }
  return <div aria-busy={busy}>
    <h2>System administration</h2>
    {error && <p role="alert" className="error">{error}</p>}{message && <p role="status">{message}</p>}
    <section><h3>Accounts and assignments</h3>
      <label>Search staff<input value={q} maxLength={80} onChange={e => {setQ(e.target.value); setPage(1);}} /></label>
      <div className="table-wrap"><table><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Action</th></tr></thead><tbody>{accounts.map(user => <tr key={user.id}><td>{user.name}</td><td>{user.email}</td><td>{user.role}</td><td>{user.active ? 'Active' : 'Disabled'}</td><td><button onClick={() => {setSelected(user); setRole(user.role);}}>Edit account</button></td></tr>)}</tbody></table></div>
      <div className="pagination"><button disabled={page === 1} onClick={() => setPage(page - 1)}>Previous accounts</button><span>Page {page} · {total} accounts</span><button disabled={page * 20 >= total} onClick={() => setPage(page + 1)}>Next accounts</button></div>
      <h4>{selected ? `Edit ${selected.name}` : 'Create demo account'}</h4>
      <form key={selected?.id ?? 'new'} onSubmit={accountSubmit}><fieldset disabled={busy}>
        <label>Staff name<input name="name" required minLength={3} maxLength={100} defaultValue={selected?.name} /></label>
        <label>Staff email<input name="email" type="email" required defaultValue={selected?.email} /></label>
        <label>{selected ? 'New password (leave empty to keep)' : 'Initial password'}<input name="password" type="password" autoComplete="new-password" minLength={12} maxLength={200} required={!selected} /></label>
        <label>Staff role<select value={role} onChange={e => setRole(e.target.value)}>{['OFFICER', 'SUPERVISOR', 'ADMIN'].map(item => <option key={item}>{item}</option>)}</select></label>
        {role === 'OFFICER' && <label>Assigned supervisor<select name="supervisorId" defaultValue={selected?.supervisorId ?? ''} required><option value="">Choose supervisor</option>{supervisors.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}
        {selected && <label><input type="checkbox" name="active" defaultChecked={selected.active} />Account active</label>}
        <p>Role, password, email and activation changes sign the affected account out. Reassignment transfers unfinished work.</p>
        <button>Save account</button> {selected && <button type="button" onClick={() => {setSelected(null); setRole('OFFICER');}}>Cancel account edit</button>}
      </fieldset></form>
    </section>
    <section><h3>Demo offence categories</h3><ul>{categories.map(item => <li key={item.id}>{item.code} · {item.name} · {item.demoFineAmount} training units · {item.active ? 'Active' : 'Inactive'} <button onClick={() => setCategory(item)}>Edit category</button></li>)}</ul>
      <form key={category?.id ?? 'new-category'} onSubmit={categorySubmit}><fieldset disabled={busy}>
        <label>Category code<input name="code" required pattern="[A-Z0-9\-]{3,20}" defaultValue={category?.code} /></label>
        <label>Category name<input name="name" required minLength={3} maxLength={100} defaultValue={category?.name} /></label>
        <label>Description<textarea name="description" required minLength={3} maxLength={1000} defaultValue={category?.description} /></label>
        <label>Demo amount (training units)<input name="amount" type="number" min="0" max="999999.99" step="0.01" required defaultValue={category?.demoFineAmount} /></label>
        <label><input name="active" type="checkbox" defaultChecked={category?.active ?? true} />Available to officers</label>
        <button>Save category</button> {category && <button type="button" onClick={() => setCategory(null)}>Cancel category edit</button>}
      </fieldset></form>
    </section>
    <section><h3>System notice</h3><form onSubmit={e => {e.preventDefault(); void save(() => api('/admin/settings', {publicNotice: notice}, 'PATCH'));}}><label>Demo public notice<textarea required minLength={3} maxLength={1000} value={notice} onChange={e => setNotice(e.target.value)} /></label><button disabled={busy}>Save notice</button></form></section>
    {security && <section><h3>Security and access permissions</h3><p>{security.activeUsers} active accounts · {security.activeSessions} active sessions · {security.failedLoginsLast24Hours} failed sign-ins in 24 hours</p><p>Sessions expire after 30 minutes. Sign-in attempts are limited to five per minute.</p>
      <table><thead><tr><th>Role</th><th>Server-enforced access</th></tr></thead><tbody>{Object.entries(security.permissions).map(([name, permissions]) => <tr key={name}><td>{name}</td><td>{permissions.join(', ')}</td></tr>)}</tbody></table>
      <h4>Latest 50 audit events</h4><button disabled={busy} onClick={() => void save(refresh)}>Refresh security</button><div className="table-wrap"><table><thead><tr><th>Time</th><th>Actor</th><th>Action</th><th>Record</th></tr></thead><tbody>{security.events.map(event => <tr key={event.id}><td>{new Date(event.timestamp).toLocaleString()}</td><td>{event.actor?.name ?? 'Unauthenticated'}</td><td>{event.action}</td><td>{event.entityType}</td></tr>)}</tbody></table></div>
    </section>}
  </div>;
}

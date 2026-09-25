import { SUPABASE_URL, SUPABASE_KEY } from './config.js';
import { validateArea } from './data.js';
const SESSION_KEY = 'vehicle-control:supabase-session:v1';

// Only the short-lived access token is kept for this tab. No password is stored.
export class SupabaseVehicleRepository {
  constructor() {
    try { this.session = JSON.parse(sessionStorage.getItem(SESSION_KEY)); }
    catch { this.session = null; }
  }
  isSignedIn() {
    return Boolean(this.session?.access_token && this.session.expires_at > Date.now() / 1000);
  }
  clearSession() {
    this.session = null;
    sessionStorage.removeItem(SESSION_KEY);
  }
  async request(path, { method = 'GET', body, publicRequest = false } = {}) {
    if (!publicRequest && !this.isSignedIn()) {
      this.clearSession();
      throw new Error('Bitte erneut anmelden. Deine Sitzung ist abgelaufen.');
    }
    const headers = { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' };
    if (!publicRequest) headers.Authorization = `Bearer ${this.session.access_token}`;
    let response;
    try {
      response = await fetch(SUPABASE_URL + path, {
        method, headers, body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(20000), cache: 'no-store',
      });
    } catch {
      throw new Error('Verbindung fehlgeschlagen. Internet prüfen und erneut versuchen.');
    }
    const result = await response.json().catch(() => null);
    if (!response.ok) {
      if (response.status === 401 && !publicRequest) this.clearSession();
      const message = result?.message || result?.msg || result?.error_description;
      throw new Error(message || `Der Server meldet Fehler ${response.status}.`);
    }
    return result;
  }
  async signIn(email, password) {
    const result = await this.request('/auth/v1/token?grant_type=password', {
      method: 'POST', body: { email, password }, publicRequest: true,
    });
    this.session = {
      access_token: result.access_token,
      expires_at: result.expires_at || Math.floor(Date.now() / 1000) + result.expires_in,
    };
    try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(this.session)); }
    catch { this.session = null; throw new Error('Sitzung kann nicht gespeichert werden. Browser-Speicher zulassen.'); }
    try { await this.request('/rest/v1/rpc/vc_require_member', { method: 'POST', body: {} }); }
    catch (error) { this.clearSession(); throw error; }
  }
  async signOut() {
    try { if (this.isSignedIn()) await this.request('/auth/v1/logout?scope=local', { method: 'POST' }); }
    finally { this.clearSession(); }
  }
  async list() {
    await this.request('/rest/v1/rpc/vc_require_member', { method: 'POST', body: {} });
    const rows = [];
    // Explicit pagination avoids silently truncating larger inventories.
    for (let offset = 0; ; ) {
      const page = await this.request(`/rest/v1/vc_vehicles?select=*&order=id.asc&limit=500&offset=${offset}`);
      rows.push(...page);
      if (!page.length) break;
      offset += page.length;
    }
    return rows.map(v => ({
      id: v.id, vin: v.vin, brand: v.brand, model: v.model, condition: v.condition,
      qrId: v.qr_id, areaId: v.area_id, version: v.version, updatedAt: v.updated_at, history: [],
    }));
  }
  async history(id) {
    const rows = await this.request(`/rest/v1/vc_moves?vehicle_id=eq.${encodeURIComponent(id)}&select=from_area,to_area,created_at&order=id.desc&limit=100`);
    return rows.map(h => ({ from: h.from_area, to: h.to_area, at: h.created_at }));
  }
  async move(id, areaId, expectedVersion) {
    validateArea(areaId);
    return this.request('/rest/v1/rpc/vc_move_vehicle', {
      method: 'POST', body: { p_id: id, p_area: areaId, p_version: expectedVersion },
    });
  }
}

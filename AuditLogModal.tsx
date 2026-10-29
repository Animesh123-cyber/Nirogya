import React, { useState } from 'react';
import { AuditLogEntry } from '../types/clinical';
import { 
  ShieldCheck, 
  X, 
  Search, 
  Filter, 
  Clock, 
  User, 
  FileCheck, 
  AlertTriangle, 
  Download,
  Lock
} from 'lucide-react';

interface AuditLogModalProps {
  isOpen: boolean;
  onClose: () => void;
  logs: AuditLogEntry[];
}

export const AuditLogModal: React.FC<AuditLogModalProps> = ({
  isOpen,
  onClose,
  logs
}) => {
  const [filterAction, setFilterAction] = useState<string>('ALL');
  const [searchTerm, setSearchTerm] = useState('');

  if (!isOpen) return null;

  const filteredLogs = logs.filter(log => {
    const matchesAction = filterAction === 'ALL' || log.action === filterAction;
    const matchesSearch = 
      log.actorName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.patientName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.justification.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesAction && matchesSearch;
  });

  const handleExportCSV = () => {
    const headers = ['Timestamp', 'Actor Name', 'Role', 'Action', 'Patient', 'Clinical Justification'];
    const rows = filteredLogs.map(l => [
      l.timestamp,
      l.actorName,
      l.actorRole,
      l.action,
      l.patientName,
      `"${l.justification.replace(/"/g, '""')}"`
    ]);
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `medflow-hipaa-audit-${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-4xl w-full max-h-[85vh] flex flex-col shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95">
        
        {/* Header */}
        <div className="p-5 border-b border-slate-200 flex items-center justify-between bg-slate-50/80 rounded-t-2xl">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-100 text-emerald-700 rounded-xl">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-bold text-base text-slate-900">HIPAA Security & Access Audit Trail</h2>
              <p className="text-xs text-slate-500">Immutable 45 CFR § 164.312(b) compliant event logs for all PHI access and clinical decisions.</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Filter bar */}
        <div className="p-4 border-b border-slate-200 bg-white flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2 flex-1 max-w-md">
            <div className="relative w-full">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search by clinician, patient, or rationale..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 border border-slate-300 rounded-lg text-xs focus:ring-1 focus:ring-teal-500 focus:outline-none"
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <select
              aria-label="Filter Action Type"
              value={filterAction}
              onChange={(e) => setFilterAction(e.target.value)}
              className="border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-700 focus:outline-none font-medium"
            >
              <option value="ALL">All Clinical Actions</option>
              <option value="VIEW_RECORD">VIEW_RECORD</option>
              <option value="GENERATE_SOAP">GENERATE_SOAP</option>
              <option value="SIGN_SOAP">SIGN_SOAP</option>
              <option value="OVERRIDE_DRUG_ALERT">OVERRIDE_DRUG_ALERT</option>
              <option value="TOGGLE_PHI_MASK">TOGGLE_PHI_MASK</option>
            </select>

            <button
              onClick={handleExportCSV}
              className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-lg text-xs flex items-center gap-1.5 transition-colors border border-slate-300"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export CSV</span>
            </button>
          </div>
        </div>

        {/* Audit Log Table */}
        <div className="flex-1 overflow-y-auto p-4">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-50 text-slate-600 uppercase text-[10px] font-bold border-b border-slate-200 sticky top-0">
              <tr>
                <th className="px-3 py-2">Timestamp (UTC)</th>
                <th className="px-3 py-2">Clinician / Actor</th>
                <th className="px-3 py-2">Action Type</th>
                <th className="px-3 py-2">Patient</th>
                <th className="px-3 py-2">Clinical Justification</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredLogs.map(log => (
                <tr key={log.id} className="hover:bg-slate-50">
                  <td className="px-3 py-2.5 text-slate-500 font-mono text-[11px] whitespace-nowrap">
                    {new Date(log.timestamp).toLocaleString()}
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="font-bold text-slate-900">{log.actorName}</div>
                    <div className="text-[10px] text-slate-500 capitalize">{log.actorRole}</div>
                  </td>
                  <td className="px-3 py-2.5">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono ${
                      log.action.includes('OVERRIDE')
                        ? 'bg-rose-100 text-rose-800'
                        : log.action.includes('SIGN')
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-slate-100 text-slate-800'
                    }`}>
                      {log.action}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 font-medium text-slate-800">{log.patientName}</td>
                  <td className="px-3 py-2.5 text-slate-600 max-w-xs truncate" title={log.justification}>
                    {log.justification}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-200 bg-slate-50 rounded-b-2xl flex items-center justify-between text-xs text-slate-500">
          <span>Showing {filteredLogs.length} audit entries</span>
          <span className="flex items-center gap-1 text-slate-400">
            <Lock className="w-3 h-3" /> Audit log is tamper-evident & write-once
          </span>
        </div>

      </div>
    </div>
  );
};

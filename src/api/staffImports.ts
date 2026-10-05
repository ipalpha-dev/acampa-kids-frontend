import { api, command } from "./client";
import { bearer } from "../auth/store";
import type { ImportJobStatus, PausedImport } from "./camperImports";
export type StaffImportField="name"|"phone"|"email"|"document"|"birthDate"|"probableGender"|"active"|"roomRole"|"team"|"bedroom"|"transportation"|"allergies"|"drugAllergies"|"healthIssues"|"foodRestrictions"|"dailyMedication"|"healthNotes"|"organizer"|"checkinHelper"|"vestHelper"|"scoreHelper"|"gameOrganizer";
export interface StaffImportReview {id:string;row:number;kind:"phone"|"duplicate"|"bedroom"|"roomRole"|"inactive";field:string;memberName:string;original:string;value:string;skip:boolean;resolved:boolean;context?:string;existingId?:string;existingName?:string;options?:{id:string;label:string}[];existingData?:Record<string,unknown>;incomingData?:Record<string,unknown>;mergedData?:Record<string,unknown>;mergeAvailable?:boolean}
export interface StaffImport {id:string;fileName:string;status:ImportJobStatus;columns:{source:string;target:StaffImportField|null;confidence:number;samples:string[]}[];dictionaries:{field:string;raw:string;normalized:string;value:unknown;label:string;draft:boolean;kind:string}[];reviews:StaffImportReview[];preview:Record<string,unknown>[];skipped:Record<string,unknown>[];createdItems:{kind:string;id:string;label:string;draft:boolean}[];error:string;needsSignIn?:boolean;pausedAt?:string|null}
export async function listStaffImportFields(token:string){return (await api<{fields:{key:StaffImportField;label:string}[]}>("/api/staff-imports/fields",{headers:bearer(token)})).fields}
export async function analyzeStaffFile(token:string,file:File,mapping?:Record<string,string|null>,progressId?:string){const body=new FormData();body.append("file",file);if(mapping)body.append("mapping",JSON.stringify(mapping));if(progressId)body.append("progress",progressId);return (await api<{import:StaffImport}>("/api/staff-imports/analyze",{method:"POST",headers:bearer(token),body})).import}

export interface ImportPhaseInfo { key: string; pct: number }

export async function getStaffImportProgress(tokenId: string, progressId: string): Promise<ImportPhaseInfo | null> {
  const res = await api<{ progress: ImportPhaseInfo | null }>(`/api/staff-imports/progress/${progressId}`, { headers: bearer(tokenId) });
  return res.progress;
}
export async function createImportStaffDraft(token:string,id:string,reviewId:string,phone:string){return command<{staff:{id:string;name:string};import:StaffImport}>(`/api/staff-imports/${id}/members`,{method:"POST",headers:{...bearer(token),"content-type":"application/json"},body:JSON.stringify({reviewId,phone})},["staff"])}
export async function applyStaffImport(token:string,id:string,file:File,delta:Record<string,{value?:string;skip?:boolean}>,sendWelcomes:boolean,declinedCategoryIds:string[]=[],duplicateChoice:"update"|"keep"|"merge"|""=""){const body=new FormData();body.append("file",file);body.append("delta",JSON.stringify(delta));body.append("sendWelcomes",String(sendWelcomes));body.append("declinedCategoryIds",JSON.stringify(declinedCategoryIds));body.append("duplicateChoice",duplicateChoice);return command<{import?:StaffImport;inserted:number;updated:number;loginsCreated:number;welcomeQueued:number;skipped:{row?:unknown;name?:unknown;reason?:unknown}[]}>(`/api/staff-imports/${id}/apply`,{method:"POST",headers:bearer(token),body},["staff","bedrooms","teams","transports","categories","settings"])}

/** The staff imports I started whose AI health pass waits for my new sign-in (decision 50). */
export async function listPausedStaffImports(token: string): Promise<PausedImport[]> {
  const res = await api<{ imports: PausedImport[] }>("/api/staff-imports/needs-sign-in", { headers: bearer(token), cache: "no-store" });
  return res.imports;
}

/** Resumes a paused staff import with my fresh coordenação sign-in (only the importer). */
export async function resumeStaffImport(token: string, id: string): Promise<StaffImport> {
  const res = await api<{ import: StaffImport }>(`/api/staff-imports/${encodeURIComponent(id)}/resume`, { method: "POST", headers: bearer(token) });
  return res.import;
}

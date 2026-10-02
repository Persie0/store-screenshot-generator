import { dashboardProjects } from './project-state.ts';
import type { Project } from './storage.ts';

const esc=(value:string)=>value.replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]!));
const status:Record<Project['status'],string>={analyzing:'Analyzing screenshots','needs-approval':'English design ready',translating:'Translating approved copy',ready:'Ready to export',error:'Needs attention'};

export function shouldShowDashboard(projects:Project[],forceNewProject=false):boolean{return projects.length>0&&!forceNewProject}

export function dashboardMarkup(projects:Project[],thumbnailUrls:Record<string,string>={}):string{
 const ordered=dashboardProjects(projects);
 return `<div class="dashboard-shell"><header class="topbar"><a class="brand" href="#"><span class="brand-mark">f</span>frame<span class="brand-period">.</span></a><div class="topbar-meta"><span class="secure-dot"></span> PRIVATE, ON THIS DEVICE</div><div class="dashboard-count">${ordered.length} project${ordered.length===1?'':'s'}</div></header>
 <main class="dashboard-main"><div class="dashboard-hero"><div><span class="eyebrow">YOUR PROJECTS</span><h1>Store stories, <em>ready when you are.</em></h1><p>Open a project to edit copy, crop screenshots, translate, preview the exact export, or download store-ready assets.</p></div><button class="dashboard-new" data-new-project>+ New project</button></div>
 <section class="dashboard-grid">${ordered.map(project=>{const thumb=thumbnailUrls[project.id];return `<article class="dashboard-card" data-open="${esc(project.id)}"><div class="dashboard-thumb" style="--tile:${esc(project.analysis?.palette.paper||'#f0f0e9')};--accent:${esc(project.analysis?.palette.accent||'#4857d9')}">${thumb?`<img src="${esc(thumb)}" alt="">`:`<b>${esc(project.name.slice(0,1).toUpperCase())}</b>`}<span>${project.screens.length}</span></div><div class="dashboard-card-body"><div class="dashboard-card-title"><b>${esc(project.name)}</b><small>${project.screens.length} screen${project.screens.length===1?'':'s'} · ${new Date(project.updatedAt).toLocaleDateString()}</small></div><span class="dashboard-status">${esc(status[project.status])}</span><div class="dashboard-actions"><button data-rename="${esc(project.id)}">Rename</button><button data-duplicate="${esc(project.id)}">Duplicate</button><button data-delete="${esc(project.id)}">Delete</button><button class="open-project" data-open="${esc(project.id)}">Open →</button></div></div></article>`}).join('')}</section>
 </main><button class="project-fab" data-new-project aria-label="New project">+</button><footer class="dashboard-footer"><span>FRAME / 2026</span><span>Saved on this device</span></footer></div>`;
}

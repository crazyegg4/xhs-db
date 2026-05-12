import { useState, useEffect, useMemo } from 'react';
import dayjs from 'dayjs';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, BarController, LineElement, LineController, PointElement, DoughnutController, ArcElement, Filler, Tooltip, Legend } from 'chart.js';
import { Bar, Line, Doughnut } from 'react-chartjs-2';
import ChartDataLabels from 'chartjs-plugin-datalabels';
import Papa from 'papaparse';

ChartJS.register(CategoryScale, LinearScale, BarElement, BarController, LineElement, LineController, PointElement, DoughnutController, ArcElement, Filler, Tooltip, Legend, ChartDataLabels);

type RawRecord = Record<string, unknown>;
type TabType = '总览' | '直播推广' | '商销推广' | '产品分析' | '单篇诊断' | '笔记总表';
const VALID_STATUS = ['有效','计划预算不足','账户日预算不足','计划处于暂停时段'];
const LIVE_VALID_STATUS = ['有效','计划预算不足','账户日预算不足','计划处于暂停时段'];
const PAGE_SIZE = 20;

const C = {
  bg:'#F9FAFB', primary:'#FF2442',
  pink:'#FF8E9C', blue:'#7DD3FC', orange:'#FED7AA',
  purple:'#C4B5FD', green:'#86EFAC',
  text:'#1F2937', subtext:'#6B7280', border:'#E5E7EB',
};

const n = (v: unknown): number => {
  if (v == null || v === '') return 0;
  return parseFloat(String(v).replace(/,/g,'').replace(/¥/g,'')) || 0;
};
const fmtY = (v: number): string => {
  if (v <= 0) return '-';
  if (v >= 1e8) return '¥'+(v/1e8).toFixed(1)+'亿';
  if (v >= 1e4) return '¥'+(v/1e4).toFixed(1)+'万';
  return '¥'+v.toLocaleString('zh-CN',{maximumFractionDigits:0});
};
const fmtROI = (v: number): string => v > 0 ? v.toFixed(2) : '-';
const pctVal = (a: number, b: number): number => b === 0 ? 0 : (a-b)/b*100;
const roiColor = (r: number): string => r >= 2.5 ? '#ef4444' : r >= 1.5 ? '#eab308' : '#6b7280';
const trendColor = (v: number): string => v > 0 ? '#22c55e' : v < 0 ? '#ef4444' : '#6b7280';
const trendArrow = (v: number): string => v > 0 ? '↑' : v < 0 ? '↓' : '→';

function parseCSV(text: string): RawRecord[] {
  if (!text) return [];
  const result = Papa.parse(text, { header: true, skipEmptyLines: true });
  return result.data as RawRecord[];
}

function matchCond(val: number, cond: string): boolean {
  if (!cond) return true;
  const m = cond.match(/^(<=|>=|<|>|=)?\s*(\d+(?:\.\d+)?)$/);
  if (!m) return true;
  const op = m[1] || '='; const num = parseFloat(m[2]);
  if (op === '<=') return val <= num;
  if (op === '>=') return val >= num;
  if (op === '<') return val < num;
  if (op === '>') return val > num;
  return val === num;
}

function classifyNote(spend: number, roi: number, standards: {评级:string;消耗条件:string;ROI条件:string}[]): string {
  for (const s of standards) {
    if (matchCond(spend, s.消耗条件) && matchCond(roi, s.ROI条件)) return s.评级;
  }
  return '未分类';
}

function calcKPI(records: RawRecord[]) {
  let 消耗=0, 产出=0;
  for (const r of records) { 消耗+=n(r['消费']||r['消耗']||0); 产出+=n(r['7日总支付金额']||r['产出']||0); }
  return { 消耗, 产出, ROI: 消耗>0?产出/消耗:0 };
}

function buildTrend(records: RawRecord[], scene?: string) {
  const filtered = scene ? records.filter(r=>String(r['营销场景']||'')===scene) : records;
  const byDate: Record<string,{消耗:number;产出:number}> = {};
  for (const r of filtered) {
    const d = String(r['时间']||r['日期']||'');
    if (!d) continue;
    const key = d.length>=10 ? d.slice(0,10) : d;
    if (!byDate[key]) byDate[key] = {消耗:0, 产出:0};
    byDate[key].消耗 += n(r['消费']||r['消耗']||0);
    byDate[key].产出 += n(r['7日总支付金额']||r['产出']||0);
  }
  return Object.entries(byDate).sort(([a],[b])=>a.localeCompare(b)).map(([date,v])=>({date,...v,roi:v.消耗>0?v.产出/v.消耗:0}));
}

function buildSceneShare(records: RawRecord[]) {
  const m: Record<string,number> = {};
  for (const r of records) {
    const s = String(r['营销场景']||'未知').split('x')[0].trim();
    m[s] = (m[s]||0) + n(r['消费']||r['消耗']||0);
  }
  return m;
}

const lineOpts = {
  responsive:true, maintainAspectRatio:false,
  plugins:{
    legend:{display:true,position:'top' as const,labels:{usePointStyle:true,padding:16,font:{size:11}}},
    datalabels:{
      anchor:(ctx:any)=>ctx.dataset.type==='bar'?'end':'end' as const,
      align:(ctx:any)=>ctx.dataset.type==='bar'?'end':'top' as const,
      offset:2,
      color:(ctx:any)=>ctx.dataset.type==='bar'?C.pink:'#F97316',
      font:{size:9,weight:'bold' as const},
      formatter:(v:any,ctx:any)=>ctx.dataset.type==='bar'?fmtY(v):Number(v).toFixed(2),
    },
  },
  scales:{
    x:{grid:{display:false},ticks:{color:C.subtext,font:{size:10},maxRotation:45}},
    y:{grid:{color:'#F3F4F6'},ticks:{color:C.subtext,font:{size:10},callback:(v:number)=>fmtY(Number(v))}},
    y2:{grid:{display:false},ticks:{color:'#F97316',font:{size:10},callback:(v:number)=>v.toFixed(2)},position:'right' as const},
  },
  elements:{line:{tension:0.4} as any, point:{radius:3,hoverRadius:5}},
};

const barOpts = {
  responsive:true, maintainAspectRatio:false,
  plugins:{legend:{display:true,position:'top' as const,labels:{usePointStyle:true,padding:12,font:{size:11}}},datalabels:{display:false}},
  scales:{
    x:{grid:{display:false},ticks:{color:C.subtext,font:{size:11}}},
    y:{grid:{color:'#F3F4F6'},ticks:{color:C.subtext,font:{size:10},callback:(v:number)=>fmtY(Number(v))}},
  },
  borderRadius:8,
};

function Card({children,p=24}:{children:React.ReactNode;p?:number}) {
  return <div className="bg-white rounded-2xl" style={{boxShadow:'0 4px 24px rgba(0,0,0,0.06)',borderRadius:16,padding:p}}>{children}</div>;
}

function KPICard({label,value,sub,trend}:{label:string;value:string;sub?:string;trend?:number}) {
  const tc = trend!==undefined ? trendColor(trend) : C.subtext;
  return (
    <Card p={20}>
      <div className="text-sm font-medium mb-2" style={{color:C.subtext}}>{label}</div>
      <div className="text-3xl font-bold mb-1" style={{color:C.text}}>{value}</div>
      {sub && <div className="text-xs mb-1" style={{color:C.subtext}}>{sub}</div>}
      {trend!==undefined && <div className="text-xs font-medium" style={{color:tc}}>{trendArrow(trend)} {Math.abs(trend).toFixed(1)}% vs上周</div>}
    </Card>
  );
}

function ST({title,sub}:{title:string;sub?:string}) {
  return (
    <div className="flex items-center justify-between mb-4">
      <div className="text-base font-semibold" style={{color:C.text}}>{title}</div>
      {sub && <div className="text-xs px-2 py-1 rounded-full" style={{background:C.bg,color:C.subtext}}>{sub}</div>}
    </div>
  );
}

export default function App() {
  const [tab,setTab] = useState<TabType>('总览');
  const [rawHistory,setRawHistory] = useState<RawRecord[]>([]);
  const [liveCreatives,setLiveCreatives] = useState<RawRecord[]>([]);
  const [shopCreatives,setShopCreatives] = useState<RawRecord[]>([]);
  const [loading,setLoading] = useState(true);
  const [dateRange,setDateRange] = useState<[string,string]>(()=>{
    const end=dayjs().subtract(1,'day');
    return[end.subtract(6,'day').format('YYYY-MM-DD'),end.format('YYYY-MM-DD')];
  });
  const [liveFilter,setLiveFilter] = useState<'all'|'on'|'off'>('all');
  const [shopFilter,setShopFilter] = useState<'all'|'on'|'off'>('all');
  const [liveProductFilter,setLiveProductFilter] = useState('全部');
  const [liveDirFilter,setLiveDirFilter] = useState('全部');
  const [liveNoteStatusFilter,setLiveNoteStatusFilter] = useState<'全部'|'直播'|'商销'>('全部');
  const [shopNoteStatusFilter,setShopNoteStatusFilter] = useState<'全部'|'直播'|'商销'>('全部');
  const [liveSortField,setLiveSortField] = useState<'消耗'|'ROI'>('消耗');
  const [liveSortDir,setLiveSortDir] = useState<'asc'|'desc'>('desc');
  const [notesList,setNotesList] = useState<RawRecord[]>([]);
  const [selNoteId,setSelNoteId] = useState('');
  const [page,setPage] = useState(1);
  const [noteSortField,setNoteSortField] = useState<'消耗'|'ROI'>('消耗');
  const [noteSortDir,setNoteSortDir] = useState<'asc'|'desc'>('desc');
  const [noteSearchId,setNoteSearchId] = useState('');
  const [livePage,setLivePage] = useState(1);
  const [shopProductFilter,setShopProductFilter] = useState('全部');
  const [shopDirFilter,setShopDirFilter] = useState('全部');
  const [shopSortField,setShopSortField] = useState<'消耗'|'ROI'>('消耗');
  const [shopSortDir,setShopSortDir] = useState<'asc'|'desc'>('desc');
  const [shopPage,setShopPage] = useState(1);
  const [projects,setProjects] = useState<{id:string;name:string;path:string;nameParts?:string[];order?:number}[]>([]);
  const [currentProjectId,setCurrentProjectId] = useState('default');
  const [refreshKey,setRefreshKey] = useState(0);
  const [updateStatus,setUpdateStatus] = useState<'idle'|'loading'|'success'|'error'>('idle');
  const [prodTab,setProdTab] = useState('');
  const [prodSortField,setProdSortField] = useState<'消耗'|'ROI'>('消耗');
  const [prodSortDir,setProdSortDir] = useState<'asc'|'desc'>('desc');
  const [prodPage,setProdPage] = useState(1);
  const [prodShopSortField,setProdShopSortField] = useState<'消耗'|'ROI'>('消耗');
  const [prodShopSortDir,setProdShopSortDir] = useState<'asc'|'desc'>('desc');
  const [prodShopPage,setProdShopPage] = useState(1);
  const [allLiveSortField,setAllLiveSortField] = useState<'消耗'|'ROI'>('消耗');
  const [allLiveSortDir,setAllLiveSortDir] = useState<'asc'|'desc'>('desc');
  const [allLivePage,setAllLivePage] = useState(1);
  const [allShopSortField,setAllShopSortField] = useState<'消耗'|'ROI'>('消耗');
  const [allShopSortDir,setAllShopSortDir] = useState<'asc'|'desc'>('desc');
  const [allShopPage,setAllShopPage] = useState(1);
  const [allNoteSearchId,setAllNoteSearchId] = useState('');
  const [noteStandards,setNoteStandards] = useState<{评级:string;消耗条件:string;ROI条件:string}[]>([]);
  const [allLiveRatingFilter,setAllLiveRatingFilter] = useState('全部');
  const [allShopRatingFilter,setAllShopRatingFilter] = useState('全部');
  const [liveRatingFilter,setLiveRatingFilter] = useState('全部');
  const [shopRatingFilter,setShopRatingFilter] = useState('全部');
  const [allLiveStatusFilter,setAllLiveStatusFilter] = useState<'全部'|'在投'|'未在投'>('全部');
  const [allShopStatusFilter,setAllShopStatusFilter] = useState<'全部'|'在投'|'未在投'>('全部');
  const [allProductFilter,setAllProductFilter] = useState('全部');

  const currentProjectPath = useMemo(()=>{
    const p=projects.find(p=>p.id===currentProjectId);
    return p?.path||'';
  },[projects,currentProjectId]);

  const currentNameParts = useMemo(()=>{
    const p=projects.find(p=>p.id===currentProjectId);
    return p?.nameParts||[];
  },[projects,currentProjectId]);

  function parseNameFields(name:string, parts:string[]):Record<string,string>{
    if(!name||!parts.length)return {};
    const segs=name.split('-').map(s=>s.trim());
    const r:Record<string,string>={};
    parts.forEach((field,i)=>{if(i<segs.length&&segs[i])r[field]=segs[i];});
    return r;
  }

  function enrichRecords(records:RawRecord[], nameParts:string[], notesDirMap:Map<string,string>, notesProductMap:Map<string,string>):RawRecord[]{
    if(!nameParts.length)return records;
    return records.map(r=>{
      const name=String(r['创意名称']||'');
      const parsed=parseNameFields(name,nameParts);
      const id=String(r['笔记/素材ID']||r['笔记ID']||'');
      return {
        ...r,
        ...(parsed['内容方向']&&!r['内容方向']?{内容方向:parsed['内容方向']}:{}),
        ...(parsed['投放人群']&&!r['投放人群']?{投放人群:parsed['投放人群']}:{}),
        ...(parsed['投放形式']&&!r['投放形式']?{投放形式:parsed['投放形式']}:{}),
        ...(!r['产品']&&notesProductMap.get(id)?{产品:notesProductMap.get(id)}:{}),
        ...(!r['内容方向']&&notesDirMap.get(id)?{内容方向:notesDirMap.get(id)}:{}),
      };
    });
  }

  useEffect(()=>{
    fetch('/projects/projects.json').then(r=>r.json()).then(d=>{
      const list=(d.projects||[]).sort((a:any,b:any)=>(a.order??999)-(b.order??999));
      setProjects(list);
      if(list.length>0)setCurrentProjectId(list[0].id);
    }).catch(()=>{});
  },[]);

  useEffect(()=>{
    if(!currentProjectPath)return;
    setLoading(true);
    Promise.all([
      fetch(currentProjectPath+'history.csv').then(r=>r.text()).catch(()=>''),
      fetch(currentProjectPath+'live_creatives.csv').then(r=>r.text()).catch(()=>''),
      fetch(currentProjectPath+'shop_creatives.csv').then(r=>r.text()).catch(()=>''),
      fetch(currentProjectPath+'notes_table.csv').then(r=>r.text()).catch(()=>''),
      fetch(currentProjectPath+'note_standard.csv').then(r=>r.text()).catch(()=>''),
    ]).then(([h,l,s,n,std])=>{
      const notes=parseCSV(n);
      setNotesList(notes);
      const stds=parseCSV(std).map(r=>({评级:String(r['笔记评级']||''),消耗条件:String(r['消耗条件']||''),ROI条件:String(r['ROI条件']||'')}));
      setNoteStandards(stds);
      // Build enrichment maps from notes
      const dirMap=new Map<string,string>();
      const prodMap=new Map<string,string>();
      for(const r of notes){
        const id=String(r['笔记ID']||'');
        if(id){dirMap.set(id,String(r['笔记内容方向']||''));prodMap.set(id,String(r['产品']||''));}
      }
      setRawHistory(enrichRecords(parseCSV(h),currentNameParts,dirMap,prodMap));
      setLiveCreatives(enrichRecords(parseCSV(l),currentNameParts,dirMap,prodMap));
      setShopCreatives(enrichRecords(parseCSV(s),currentNameParts,dirMap,prodMap));
      setLoading(false);
    });
  },[currentProjectPath,currentNameParts,refreshKey]);

  const handleUpdateData = async () => {
    setUpdateStatus('loading');
    try {
      const res = await fetch('/api/preprocessCsv', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: currentProjectId }),
      });
      const data = await res.json();
      if (data.success) {
        setUpdateStatus('success');
        setRefreshKey(k => k + 1);
      } else {
        setUpdateStatus('error');
        console.error('预处理失败:', data.errors);
      }
    } catch (e) {
      setUpdateStatus('error');
      console.error('请求失败:', e);
    }
    setTimeout(() => setUpdateStatus('idle'), 2000);
  };

  const liveStatusMap = useMemo(()=>{const m=new Map<string,string>();for(const r of liveCreatives){const id=String(r['笔记/素材ID']||'');if(!id)continue;const s=String(r['创意状态']||'');if(!m.has(id)||s==='有效')m.set(id,s);}return m;},[liveCreatives]);
  const shopStatusMap = useMemo(()=>{const m=new Map<string,string>();for(const r of shopCreatives){const id=String(r['笔记/素材ID']||'');if(!id)continue;const s=String(r['创意状态']||'');if(!m.has(id)||s==='有效')m.set(id,s);}return m;},[shopCreatives]);
  const liveNoteTypeMap = useMemo(()=>{const m=new Map<string,string>();for(const r of liveCreatives)m.set(String(r['笔记/素材ID']||''),String(r['笔记类型']||''));return m;},[liveCreatives]);
  const shopNoteTypeMap = useMemo(()=>{const m=new Map<string,string>();for(const r of shopCreatives)m.set(String(r['笔记/素材ID']||''),String(r['笔记类型']||''));return m;},[shopCreatives]);
  const noteTypeMap = useMemo(()=>{const m=new Map(liveNoteTypeMap);for(const[k,v]of shopNoteTypeMap)if(!m.has(k))m.set(k,v);return m;},[liveNoteTypeMap,shopNoteTypeMap]);

  const firstDateMap = useMemo(()=>{
    const m=new Map<string,string>();
    for(const r of rawHistory){
      const id=String(r['笔记/素材ID']||r['笔记ID']||'');
      const d=String(r['时间']||r['日期']||'');
      if(!d||n(r['消费']||r['消耗']||0)<=0)continue;
      const key=d.length>=10?d.slice(0,10):d;
      if(!m.has(id)||key<m.get(id)!)m.set(id,key);
    }
    return m;
  },[rawHistory]);

  const noteLinkMap = useMemo(()=>{
    const m=new Map<string,string>();
    for(const r of rawHistory){
      const id=String(r['笔记/素材ID']||r['笔记ID']||'');
      const link=String(r['笔记/素材链接']||'');
      if(id&&link&&!m.has(id))m.set(id,link);
    }
    return m;
  },[rawHistory]);

  const filtered = useMemo(()=>{
    const [s,e]=dateRange;
    return rawHistory.filter(r=>{const d=String(r['时间']||r['日期']||'');return d>=s&&d<=e;});
  },[rawHistory,dateRange]);

  const allRecordsProductMap = useMemo(()=>{const m=new Map();for(const r of rawHistory)m.set(String(r['笔记ID']||r['笔记/素材ID']||''),String(r['产品']||''));return m;},[rawHistory]);
  const notesDirMap = useMemo(()=>{const m=new Map();for(const r of notesList)m.set(String(r['笔记ID']||''),String(r['笔记内容方向']||''));return m;},[notesList]);
  const notesProductMap = useMemo(()=>{const m=new Map();for(const r of notesList)m.set(String(r['笔记ID']||''),String(r['产品']||''));return m;},[notesList]);
  const notesShortNameMap = useMemo(()=>{const m=new Map();for(const r of notesList)m.set(String(r['笔记ID']||''),String(r['笔记简称']||''));return m;},[notesList]);

  const liveRecords = useMemo(()=>filtered.filter(r=>String(r['营销场景']||'').includes('直播推广')),[filtered]);
  const shopRecords = useMemo(()=>filtered.filter(r=>String(r['营销场景']||'').includes('商品推广')),[filtered]);
  const allKPI = useMemo(()=>calcKPI(filtered),[filtered]);
  const liveKPI = useMemo(()=>calcKPI(liveRecords),[liveRecords]);
  const shopKPI = useMemo(()=>calcKPI(shopRecords),[shopRecords]);
  const allTrend = useMemo(()=>buildTrend(filtered),[filtered]);
  const liveTrend = useMemo(()=>buildTrend(liveRecords),[liveRecords]);
  const shopTrend = useMemo(()=>buildTrend(shopRecords),[shopRecords]);
  const sceneShare = useMemo(()=>buildSceneShare(filtered),[filtered]);
  const noteTypeSpend = useMemo(()=>{
    const m:Record<string,number>={};
    for(const r of filtered){
      const id=String(r['笔记/素材ID']||r['笔记ID']||'');
      const t=String(noteTypeMap.get(id)||'未知');
      m[t]=(m[t]||0)+n(r['消费']||r['消耗']||0);
    }
    return m;
  },[filtered,noteTypeMap]);
  const videoVsImage = useMemo(()=>{
    let vSpend=0,vOut=0,iSpend=0,iOut=0;
    for(const r of filtered){
      const id=String(r['笔记/素材ID']||r['笔记ID']||'');
      const t=String(noteTypeMap.get(id)||'');
      const spend=n(r['消费']||r['消耗']||0);
      const out=n(r['7日总支付金额']||r['产出']||0);
      if(t==='视频笔记'){vSpend+=spend;vOut+=out;}
      else{iSpend+=spend;iOut+=out;}
    }
    return {
      视频:{消耗:vSpend,产出:vOut,ROI:vSpend>0?vOut/vSpend:0},
      图文:{消耗:iSpend,产出:iOut,ROI:iSpend>0?iOut/iSpend:0},
    };
  },[filtered,noteTypeMap]);

  const liveSpendMap = useMemo(()=>{const m=new Map();for(const r of liveRecords){{const id=String(r['笔记/素材ID']||'');m.set(id,(m.get(id)||0)+n(r['消费']||r['消耗']||0));}}return m;},[liveRecords]);
  const liveOutMap = useMemo(()=>{const m=new Map();for(const r of liveRecords){{const id=String(r['笔记/素材ID']||'');m.set(id,(m.get(id)||0)+n(r['7日总支付金额']||r['产出']||0));}}return m;},[liveRecords]);
  const shopSpendMap = useMemo(()=>{const m=new Map();for(const r of shopRecords){{const id=String(r['笔记/素材ID']||'');m.set(id,(m.get(id)||0)+n(r['消费']||r['消耗']||0));}}return m;},[shopRecords]);
  const shopOutMap = useMemo(()=>{const m=new Map();for(const r of shopRecords){{const id=String(r['笔记/素材ID']||'');m.set(id,(m.get(id)||0)+n(r['7日总支付金额']||r['产出']||0));}}return m;},[shopRecords]);

  const liveByProduct = useMemo(()=>{
    const m:Record<string,{ids:Set<string>;消耗:number;产出:number}>={};
    for(const r of liveRecords){
      const spend=n(r['消费']||r['消耗']||0);
      if(spend<=0)continue;
      const id=String(r['笔记/素材ID']||'');
      const p=String(r['产品']||notesProductMap.get(id)||allRecordsProductMap.get(id)||'未知');
      if(!m[p])m[p]={ids:new Set(),消耗:0,产出:0};
      m[p].ids.add(id);m[p].消耗+=spend;m[p].产出+=n(r['7日总支付金额']||r['产出']||0);
    }
    return Object.entries(m).map(([产品,v])=>({产品,笔记数:v.ids.size,消耗:v.消耗,产出:v.产出,ROI:v.消耗>0?v.产出/v.消耗:0})).sort((a,b)=>b.消耗-a.消耗);
  },[liveRecords,notesProductMap,allRecordsProductMap]);

  const liveByDir = useMemo(()=>{
    const m:Record<string,{ids:Set<string>;消耗:number;产出:number}>={};
    for(const r of liveRecords){
      const spend=n(r['消费']||r['消耗']||0);
      if(spend<=0)continue;
      const id=String(r['笔记/素材ID']||'');
      const d=String(r['内容方向']||notesDirMap.get(id)||'未知');
      if(!m[d])m[d]={ids:new Set(),消耗:0,产出:0};
      m[d].ids.add(id);m[d].消耗+=spend;m[d].产出+=n(r['7日总支付金额']||r['产出']||0);
    }
    return Object.entries(m).map(([内容方向,v])=>({内容方向,笔记数:v.ids.size,消耗:v.消耗,产出:v.产出,ROI:v.消耗>0?v.产出/v.消耗:0})).sort((a,b)=>b.消耗-a.消耗);
  },[liveRecords,notesDirMap]);

  const shopByProduct = useMemo(()=>{
    const m:Record<string,{ids:Set<string>;消耗:number;产出:number}>={};
    for(const r of shopRecords){
      const spend=n(r['消费']||r['消耗']||0);
      if(spend<=0)continue;
      const id=String(r['笔记/素材ID']||'');
      const p=String(r['产品']||notesProductMap.get(id)||allRecordsProductMap.get(id)||'未知');
      if(!m[p])m[p]={ids:new Set(),消耗:0,产出:0};
      m[p].ids.add(id);m[p].消耗+=spend;m[p].产出+=n(r['7日总支付金额']||r['产出']||0);
    }
    return Object.entries(m).map(([产品,v])=>({产品,笔记数:v.ids.size,消耗:v.消耗,产出:v.产出,ROI:v.消耗>0?v.产出/v.消耗:0})).sort((a,b)=>b.消耗-a.消耗);
  },[shopRecords,notesProductMap,allRecordsProductMap]);

  // ── 产品分析 ──
  const allByProduct = useMemo(()=>{
    const map:Record<string,{直播消耗:number;直播产出:number;商销消耗:number;商销产出:number}>={};
    for(const r of liveByProduct){
      if(!map[r.产品])map[r.产品]={直播消耗:0,直播产出:0,商销消耗:0,商销产出:0};
      map[r.产品].直播消耗=r.消耗;map[r.产品].直播产出=r.产出;
    }
    for(const r of shopByProduct){
      if(!map[r.产品])map[r.产品]={直播消耗:0,直播产出:0,商销消耗:0,商销产出:0};
      map[r.产品].商销消耗=r.消耗;map[r.产品].商销产出=r.产出;
    }
    const arr=Object.entries(map).map(([产品,v])=>{
      const 总消耗=v.直播消耗+v.商销消耗;const 总产出=v.直播产出+v.商销产出;
      return{产品,直播消耗:v.直播消耗,直播ROI:v.直播消耗>0?v.直播产出/v.直播消耗:0,商销消耗:v.商销消耗,商销ROI:v.商销消耗>0?v.商销产出/v.商销消耗:0,总消耗,总ROI:总消耗>0?总产出/总消耗:0};
    }).sort((a,b)=>b.总消耗-a.总消耗);
    const totalAll=arr.reduce((s,r)=>s+r.总消耗,0);
    return arr.map(r=>({...r,占比:totalAll>0?r.总消耗/totalAll:0}));
  },[liveByProduct,shopByProduct]);

  useEffect(()=>{
    if(!prodTab&&allByProduct.length>0)setProdTab(allByProduct[0].产品);
  },[allByProduct,prodTab]);

  const prodRecords = useMemo(()=>prodTab?filtered.filter(r=>{const p=String(r['产品']||'');return prodTab==='未知'?p===''||p==='未知':p===prodTab;}):[],[filtered,prodTab]);
  const prodLiveRecords = useMemo(()=>prodRecords.filter(r=>String(r['营销场景']||'').includes('直播推广')),[prodRecords]);
  const prodShopRecords = useMemo(()=>prodRecords.filter(r=>String(r['营销场景']||'').includes('商品推广')),[prodRecords]);
  const prodLiveTrend = useMemo(()=>buildTrend(prodLiveRecords),[prodLiveRecords]);
  const prodShopTrend = useMemo(()=>buildTrend(prodShopRecords),[prodShopRecords]);
  const prodLiveKPI = useMemo(()=>calcKPI(prodLiveRecords),[prodLiveRecords]);
  const prodShopKPI = useMemo(()=>calcKPI(prodShopRecords),[prodShopRecords]);

  const prodLiveNotes = useMemo(()=>{
    if(!prodTab)return[] as RawRecord[];
    const totalSpend=prodLiveRecords.reduce((s,r)=>s+n(r['消费']||r['消耗']||0),0);
    const m=new Map<string,RawRecord>();
    for(const r of prodLiveRecords){
      const id=String(r['笔记/素材ID']||r['笔记ID']||'');
      if(!id||m.has(id))continue;
      m.set(id,{笔记ID:id,笔记简称:notesShortNameMap.get(id)||'',笔记链接:noteLinkMap.get(id)||'',笔记类型:String(liveNoteTypeMap.get(id)||'-'),投放开始日期:firstDateMap.get(id)||'',在投:LIVE_VALID_STATUS.includes(String(liveStatusMap.get(id)||''))} as RawRecord);
    }
    return Array.from(m.values()).map(note=>{
      const id=String(note['笔记ID']||'');
      const spend=liveSpendMap.get(id)||0;const out=liveOutMap.get(id)||0;
      return{...note,消耗:spend,支付金额:out,支付ROI:spend>0?out/spend:0,消耗占比:totalSpend>0?spend/totalSpend:0} as RawRecord;
    });
  },[prodTab,prodLiveRecords,noteLinkMap,liveNoteTypeMap,firstDateMap,liveSpendMap,liveOutMap,liveStatusMap]);

  const prodShopNotes = useMemo(()=>{
    if(!prodTab)return[] as RawRecord[];
    const totalSpend=prodShopRecords.reduce((s,r)=>s+n(r['消费']||r['消耗']||0),0);
    const m=new Map<string,RawRecord>();
    for(const r of prodShopRecords){
      const id=String(r['笔记/素材ID']||r['笔记ID']||'');
      if(!id||m.has(id))continue;
      m.set(id,{笔记ID:id,笔记简称:notesShortNameMap.get(id)||'',笔记链接:noteLinkMap.get(id)||'',笔记类型:String(shopNoteTypeMap.get(id)||'-'),投放开始日期:firstDateMap.get(id)||'',在投:VALID_STATUS.includes(String(shopStatusMap.get(id)||''))} as RawRecord);
    }
    return Array.from(m.values()).map(note=>{
      const id=String(note['笔记ID']||'');
      const spend=shopSpendMap.get(id)||0;const out=shopOutMap.get(id)||0;
      return{...note,消耗:spend,支付金额:out,支付ROI:spend>0?out/spend:0,消耗占比:totalSpend>0?spend/totalSpend:0} as RawRecord;
    });
  },[prodTab,prodShopRecords,noteLinkMap,shopNoteTypeMap,firstDateMap,shopSpendMap,shopOutMap,shopStatusMap]);

  const pagedProdLiveNotes = useMemo(()=>{
    const sorted=[...prodLiveNotes].sort((a,b)=>{
      const av=Number(a[prodSortField]||0);const bv=Number(b[prodSortField]||0);
      return prodSortDir==='desc'?bv-av:av-bv;
    });
    const start=(prodPage-1)*PAGE_SIZE;
    return{list:sorted.slice(start,start+PAGE_SIZE),total:sorted.length};
  },[prodLiveNotes,prodPage,prodSortField,prodSortDir]);

  const pagedProdShopNotes = useMemo(()=>{
    const sorted=[...prodShopNotes].sort((a,b)=>{
      const av=Number(a[prodShopSortField]||0);const bv=Number(b[prodShopSortField]||0);
      return prodShopSortDir==='desc'?bv-av:av-bv;
    });
    const start=(prodShopPage-1)*PAGE_SIZE;
    return{list:sorted.slice(start,start+PAGE_SIZE),total:sorted.length};
  },[prodShopNotes,prodShopPage,prodShopSortField,prodShopSortDir]);

  const shopByDir = useMemo(()=>{
    const m:Record<string,{ids:Set<string>;消耗:number;产出:number}>={};
    for(const r of shopRecords){
      const spend=n(r['消费']||r['消耗']||0);
      if(spend<=0)continue;
      const id=String(r['笔记/素材ID']||'');
      const d=String(r['内容方向']||notesDirMap.get(id)||'未知');
      if(!m[d])m[d]={ids:new Set(),消耗:0,产出:0};
      m[d].ids.add(id);m[d].消耗+=spend;m[d].产出+=n(r['7日总支付金额']||r['产出']||0);
    }
    return Object.entries(m).map(([内容方向,v])=>({内容方向,笔记数:v.ids.size,消耗:v.消耗,产出:v.产出,ROI:v.消耗>0?v.产出/v.消耗:0})).sort((a,b)=>b.消耗-a.消耗);
  },[shopRecords,notesDirMap]);

  const noteList = useMemo(()=>{
    const m=new Map<string,RawRecord>();
    for(const r of filtered){
      const id=String(r['笔记/素材ID']||r['笔记ID']||'');
      if(!id||m.has(id))continue;
      const lt=String(liveNoteTypeMap.get(id)||'');
      const st=String(shopNoteTypeMap.get(id)||'');
      m.set(id,{
        笔记ID:id,
        笔记简称:notesShortNameMap.get(id)||'',
        笔记链接:noteLinkMap.get(id)||'',
        笔记类型:lt||st||'-',
        直播状态:liveStatusMap.get(id)||'',
        直播在投:LIVE_VALID_STATUS.includes(String(liveStatusMap.get(id)||'')),
        商笔在投:VALID_STATUS.includes(String(shopStatusMap.get(id)||'')),
        投放开始日期:firstDateMap.get(id)||'',
        产品:r['产品']||notesProductMap.get(id)||'',
        内容方向:r['内容方向']||notesDirMap.get(id)||'',
      } as RawRecord);
    }
    // 计算直播消耗和ROI
    const liveSpendById = new Map<string,number>();
    const liveOutById = new Map<string,number>();
    for(const r of liveRecords){
      const id=String(r['笔记/素材ID']||'');
      if(!id)continue;
      liveSpendById.set(id,(liveSpendById.get(id)||0)+n(r['消费']||r['消耗']||0));
      liveOutById.set(id,(liveOutById.get(id)||0)+n(r['7日总支付金额']||r['产出']||0));
    }
    // 计算商销消耗和ROI
    const shopSpendById = new Map<string,number>();
    const shopOutById = new Map<string,number>();
    for(const r of shopRecords){
      const id=String(r['笔记/素材ID']||'');
      if(!id)continue;
      shopSpendById.set(id,(shopSpendById.get(id)||0)+n(r['消费']||r['消耗']||0));
      shopOutById.set(id,(shopOutById.get(id)||0)+n(r['7日总支付金额']||r['产出']||0));
    }
    return Array.from(m.values()).map(n=>{
      const id=String(n['笔记ID']||'');
      const spend=liveSpendById.get(id)||0;
      const out=liveOutById.get(id)||0;
      const sSpend=shopSpendById.get(id)||0;
      const sOut=shopOutById.get(id)||0;
      return {...n,消耗:spend,ROI:spend>0?out/spend:0,商销消耗:sSpend,商销ROI:sSpend>0?sOut/sSpend:0} as RawRecord;
    });
  },[filtered,liveNoteTypeMap,shopNoteTypeMap,liveStatusMap,shopStatusMap,firstDateMap,notesProductMap,notesDirMap,liveRecords,shopRecords]);

  // ── 全量笔记（不受时间过滤） ──
  const allTimeAllRecords = rawHistory;
  const allTimeLiveRecords = useMemo(()=>allTimeAllRecords.filter(r=>String(r['营销场景']||'').includes('直播推广')),[allTimeAllRecords]);
  const allTimeShopRecords = useMemo(()=>allTimeAllRecords.filter(r=>String(r['营销场景']||'').includes('商品推广')),[allTimeAllRecords]);
  const allTimeLiveSpendMap = useMemo(()=>{const m=new Map<string,number>();for(const r of allTimeLiveRecords){const id=String(r['笔记/素材ID']||'');if(!id)continue;m.set(id,(m.get(id)||0)+n(r['消费']||r['消耗']||0));}return m;},[allTimeLiveRecords]);
  const allTimeLiveOutMap = useMemo(()=>{const m=new Map<string,number>();for(const r of allTimeLiveRecords){const id=String(r['笔记/素材ID']||'');if(!id)continue;m.set(id,(m.get(id)||0)+n(r['7日总支付金额']||r['产出']||0));}return m;},[allTimeLiveRecords]);
  const allTimeShopSpendMap = useMemo(()=>{const m=new Map<string,number>();for(const r of allTimeShopRecords){const id=String(r['笔记/素材ID']||'');if(!id)continue;m.set(id,(m.get(id)||0)+n(r['消费']||r['消耗']||0));}return m;},[allTimeShopRecords]);
  const allTimeShopOutMap = useMemo(()=>{const m=new Map<string,number>();for(const r of allTimeShopRecords){const id=String(r['笔记/素材ID']||'');if(!id)continue;m.set(id,(m.get(id)||0)+n(r['7日总支付金额']||r['产出']||0));}return m;},[allTimeShopRecords]);
  const allTimeFirstDateMap = useMemo(()=>{const m=new Map<string,string>();for(const r of allTimeAllRecords){const id=String(r['笔记/素材ID']||r['笔记ID']||'');const d=String(r['时间']||r['日期']||'').slice(0,10);if(!id||!d)continue;if(!m.has(id)||d<m.get(id)!)m.set(id,d);}return m;},[allTimeAllRecords]);

  const allTimeNoteList = useMemo(()=>{
    const m=new Map<string,RawRecord>();
    for(const r of allTimeAllRecords){
      const id=String(r['笔记/素材ID']||r['笔记ID']||'');
      if(!id||m.has(id))continue;
      const lt=String(liveNoteTypeMap.get(id)||'');
      const st=String(shopNoteTypeMap.get(id)||'');
      m.set(id,{
        笔记ID:id,笔记简称:notesShortNameMap.get(id)||'',笔记链接:noteLinkMap.get(id)||'',笔记类型:lt||st||'-',
        产品:r['产品']||notesProductMap.get(id)||'',
        内容方向:r['内容方向']||notesDirMap.get(id)||'',
        直播在投:LIVE_VALID_STATUS.includes(String(liveStatusMap.get(id)||'')),
        商笔在投:VALID_STATUS.includes(String(shopStatusMap.get(id)||'')),
        投放开始日期:allTimeFirstDateMap.get(id)||'',
      } as RawRecord);
    }
    return Array.from(m.values()).map(note=>{
      const id=String(note['笔记ID']||'');
      const spend=allTimeLiveSpendMap.get(id)||0;const out=allTimeLiveOutMap.get(id)||0;
      const sSpend=allTimeShopSpendMap.get(id)||0;const sOut=allTimeShopOutMap.get(id)||0;
      const 消耗=spend+sSpend;const 产出=out+sOut;
      return{...note,消耗,ROI:消耗>0?产出/消耗:0,直播消耗:spend,直播ROI:spend>0?out/spend:0,商销消耗:sSpend,商销ROI:sSpend>0?sOut/sSpend:0} as RawRecord;
    });
  },[allTimeAllRecords,liveNoteTypeMap,shopNoteTypeMap,noteLinkMap,notesProductMap,notesDirMap,liveStatusMap,shopStatusMap,allTimeFirstDateMap,allTimeLiveSpendMap,allTimeLiveOutMap,allTimeShopSpendMap,allTimeShopOutMap]);

  const allTimeLiveNotes = useMemo(()=>allTimeNoteList.filter(n=>(allTimeLiveSpendMap.get(String(n['笔记ID']||''))||0)>0).map(n=>({...n,评级:classifyNote(Number(n['直播消耗'])||0,Number(n['直播ROI'])||0,noteStandards)})),[allTimeNoteList,allTimeLiveSpendMap,noteStandards]);
  const allTimeShopNotes = useMemo(()=>allTimeNoteList.filter(n=>(allTimeShopSpendMap.get(String(n['笔记ID']||''))||0)>0).map(n=>({...n,评级:classifyNote(Number(n['商销消耗'])||0,Number(n['商销ROI'])||0,noteStandards)})),[allTimeNoteList,allTimeShopSpendMap,noteStandards]);

  const pagedAllLiveNotes = useMemo(()=>{
    let list=allTimeLiveNotes;
    if(allNoteSearchId.trim()){const q=allNoteSearchId.trim().toLowerCase();list=list.filter(n=>String(n['笔记ID']||'').toLowerCase().includes(q));}
    if(allProductFilter!=='全部'){list=list.filter(n=>String(n['产品']||'')===allProductFilter);}
    if(allLiveRatingFilter!=='全部')list=list.filter(n=>String(n['评级']||'')===allLiveRatingFilter);
    if(allLiveStatusFilter!=='全部'){const on=allLiveStatusFilter==='在投';list=list.filter(n=>Boolean(n['直播在投'])===on);}
    const sorted=[...list].sort((a,b)=>{
      const k=allLiveSortField==='消耗'?'直播消耗':'直播ROI';
      const av=Number(a[k]||0);const bv=Number(b[k]||0);
      return allLiveSortDir==='desc'?bv-av:av-bv;
    });
    const start=(allLivePage-1)*PAGE_SIZE;
    return{list:sorted.slice(start,start+PAGE_SIZE),total:sorted.length};
  },[allTimeLiveNotes,allLivePage,allLiveSortField,allLiveSortDir,allNoteSearchId,allProductFilter,allLiveRatingFilter,allLiveStatusFilter]);

  const pagedAllShopNotes = useMemo(()=>{
    let list=allTimeShopNotes;
    if(allNoteSearchId.trim()){const q=allNoteSearchId.trim().toLowerCase();list=list.filter(n=>String(n['笔记ID']||'').toLowerCase().includes(q));}
    if(allProductFilter!=='全部'){list=list.filter(n=>String(n['产品']||'')===allProductFilter);}
    if(allShopRatingFilter!=='全部')list=list.filter(n=>String(n['评级']||'')===allShopRatingFilter);
    if(allShopStatusFilter!=='全部'){const on=allShopStatusFilter==='在投';list=list.filter(n=>Boolean(n['商笔在投'])===on);}
    const sorted=[...list].sort((a,b)=>{
      const k=allShopSortField==='消耗'?'商销消耗':'商销ROI';
      const av=Number(a[k]||0);const bv=Number(b[k]||0);
      return allShopSortDir==='desc'?bv-av:av-bv;
    });
    const start=(allShopPage-1)*PAGE_SIZE;
    return{list:sorted.slice(start,start+PAGE_SIZE),total:sorted.length};
  },[allTimeShopNotes,allShopPage,allShopSortField,allShopSortDir,allNoteSearchId,allProductFilter,allShopRatingFilter,allShopStatusFilter]);

  const allNoteProducts = useMemo(()=>{
    const unique=[...new Set(allTimeNoteList.map(n=>String(n['产品']||'')))].filter(v=>v&&v!=='未知').sort();
    return ['全部','未知',...unique];
  },[allTimeNoteList]);

  const liveNoteProducts = useMemo(()=>{
    const unique=[...new Set(
      noteList.filter(n=>n['直播在投']&&String(n['产品']||'')).map(n=>String(n['产品']))
    )].filter(v=>v&&v!=='未知').sort();
    return ['全部','未知',...unique];
  },[noteList]);
  const liveNoteDirs = useMemo(()=>{
    const unique=[...new Set(
      noteList.filter(n=>n['直播在投']&&String(n['内容方向']||'')).map(n=>String(n['内容方向']))
    )].filter(v=>v&&v!=='未知').sort();
    return ['全部','未知',...unique];
  },[noteList]);

  const filteredLiveNotes = useMemo(()=>{
    return noteList.filter(n=>{
      const p=String(n['产品']||'');
      const d=String(n['内容方向']||'');
      if(liveProductFilter==='全部'){} // show all
      else if(liveProductFilter==='未知'&&p!=='')return false;
      else if(liveProductFilter!=='未知'&&p!==liveProductFilter)return false;
      if(liveDirFilter==='全部'){} // show all
      else if(liveDirFilter==='未知'&&d!=='')return false;
      else if(liveDirFilter!=='未知'&&d!==liveDirFilter)return false;
      const isLive=Boolean(n['直播在投']);
      const isShop=Boolean(n['商笔在投']);
      if(liveNoteStatusFilter==='全部'){}
      else if(liveNoteStatusFilter==='直播'&&!isLive)return false;
      else if(liveNoteStatusFilter==='商销'&&!isShop)return false;
      if(liveRatingFilter!=='全部'){
        const rating=classifyNote(Number(n['消耗'])||0,Number(n['ROI'])||0,noteStandards);
        if(rating!==liveRatingFilter)return false;
      }
      return true;
    });
  },[noteList,liveProductFilter,liveDirFilter,liveNoteStatusFilter,liveRatingFilter,noteStandards]);

  const pagedLiveNotes = useMemo(()=>{
    const sorted=[...filteredLiveNotes].sort((a,b)=>{
      if(liveSortField==='消耗'){
        const aVal=Number(a['消耗'])||0;
        const bVal=Number(b['消耗'])||0;
        return liveSortDir==='desc'?bVal-aVal:aVal-bVal;
      }else{
        const aVal=Number(a['ROI'])||0;
        const bVal=Number(b['ROI'])||0;
        return liveSortDir==='desc'?bVal-aVal:aVal-bVal;
      }
    });
    const start=(livePage-1)*PAGE_SIZE;
    return{list:sorted.slice(start,start+PAGE_SIZE),total:sorted.length};
  },[filteredLiveNotes,livePage,liveSortField,liveSortDir]);

  const shopNoteProducts = useMemo(()=>{
    const unique=[...new Set(
      noteList.filter(n=>n['商笔在投']&&String(n['产品']||'')).map(n=>String(n['产品']))
    )].filter(v=>v&&v!=='未知').sort();
    return ['全部','未知',...unique];
  },[noteList]);
  const shopNoteDirs = useMemo(()=>{
    const unique=[...new Set(
      noteList.filter(n=>n['商笔在投']&&String(n['内容方向']||'')).map(n=>String(n['内容方向']))
    )].filter(v=>v&&v!=='未知').sort();
    return ['全部','未知',...unique];
  },[noteList]);

  const filteredShopNotes = useMemo(()=>{
    return noteList.filter(n=>{
      const p=String(n['产品']||'');
      const d=String(n['内容方向']||'');
      if(shopProductFilter==='全部'){} // show all
      else if(shopProductFilter==='未知'&&p!=='')return false;
      else if(shopProductFilter!=='未知'&&p!==shopProductFilter)return false;
      if(shopDirFilter==='全部'){} // show all
      else if(shopDirFilter==='未知'&&d!=='')return false;
      else if(shopDirFilter!=='未知'&&d!==shopDirFilter)return false;
      const isLive=Boolean(n['直播在投']);
      const isShop=Boolean(n['商笔在投']);
      if(shopNoteStatusFilter==='全部'){}
      else if(shopNoteStatusFilter==='直播'&&!isLive)return false;
      else if(shopNoteStatusFilter==='商销'&&!isShop)return false;
      if(shopRatingFilter!=='全部'){
        const rating=classifyNote(Number(n['商销消耗'])||0,Number(n['商销ROI'])||0,noteStandards);
        if(rating!==shopRatingFilter)return false;
      }
      return true;
    });
  },[noteList,shopProductFilter,shopDirFilter,shopNoteStatusFilter,shopRatingFilter,noteStandards]);

  const pagedShopNotes = useMemo(()=>{
    const withShopSpend=filteredShopNotes.map(n=>({...n,消耗:n['商销消耗']||0,ROI:n['商销ROI']||0}));
    const sorted=[...withShopSpend].sort((a,b)=>{
      if(shopSortField==='消耗'){
        const aVal=Number(a['消耗'])||0;
        const bVal=Number(b['消耗'])||0;
        return shopSortDir==='desc'?bVal-aVal:aVal-bVal;
      }else{
        const aVal=Number(a['ROI'])||0;
        const bVal=Number(b['ROI'])||0;
        return shopSortDir==='desc'?bVal-aVal:aVal-bVal;
      }
    });
    const start=(shopPage-1)*PAGE_SIZE;
    return{list:sorted.slice(start,start+PAGE_SIZE),total:sorted.length};
  },[filteredShopNotes,shopPage,shopSortField,shopSortDir]);

  const pagedNotes = useMemo(()=>{
    let list=noteList;
    if(noteSearchId.trim()){
      const q=noteSearchId.trim().toLowerCase();
      list=list.filter(n=>String(n['笔记ID']||'').toLowerCase().includes(q));
    }
    const sorted=[...list].sort((a,b)=>{
      if(noteSortField==='消耗')return(noteSortDir==='desc'?1:-1)*((Number(b['消耗'])||0)-(Number(a['消耗'])||0));
      return(noteSortDir==='desc'?1:-1)*((Number(b['ROI'])||0)-(Number(a['ROI'])||0));
    });
    const start=(page-1)*PAGE_SIZE;
    return{list:sorted.slice(start,start+PAGE_SIZE),total:sorted.length};
  },[noteList,page,noteSortField,noteSortDir,noteSearchId]);

  const selNote = useMemo(()=>noteList.find(n=>String(n['笔记ID'])===selNoteId)||null,[noteList,selNoteId]);
  const selRecords = useMemo(()=>{
    if(!selNoteId)return[];
    return filtered.filter(r=>String(r['笔记/素材ID']||r['笔记ID']||'')===selNoteId).sort((a,b)=>String(a['时间']||'').localeCompare(String(b['时间']||'')));
  },[selNoteId,filtered]);
  const selKPI = useMemo(()=>calcKPI(selRecords),[selRecords]);
  const selByAudience = useMemo(()=>{
    const m:Record<string,Record<string,number>>={};
    for(const r of selRecords){
      const audience=String(r['投放人群']||'未知');
      if(!m[audience])m[audience]={消耗:0,产出:0};
      m[audience].消耗+=n(r['消费']||r['消耗']||0);
      m[audience].产出+=n(r['7日总支付金额']||r['产出']||0);
    }
    return Object.entries(m).map(([投放人群,v])=>({投放人群,消耗:v.消耗,产出:v.产出,ROI:v.消耗>0?v.产出/v.消耗:0})).sort((a,b)=>b.消耗-a.消耗);
  },[selRecords]);

  const selLiveRecords = useMemo(()=>{
    if(!selNoteId)return[];
    return liveRecords.filter(r=>String(r['笔记/素材ID']||'')===selNoteId).sort((a,b)=>String(a['时间']||'').localeCompare(String(b['时间']||'')));
  },[selNoteId,liveRecords]);
  const selShopRecords = useMemo(()=>{
    if(!selNoteId)return[];
    return shopRecords.filter(r=>String(r['笔记/素材ID']||'')===selNoteId).sort((a,b)=>String(a['时间']||'').localeCompare(String(b['时间']||'')));
  },[selNoteId,shopRecords]);
  const selLiveKPI = useMemo(()=>calcKPI(selLiveRecords),[selLiveRecords]);
  const selShopKPI = useMemo(()=>calcKPI(selShopRecords),[selShopRecords]);
  const buildAudience = (recs:RawRecord[])=>{
    const m:Record<string,Record<string,number>>={};
    for(const r of recs){
      const audience=String(r['投放人群']||'未知');
      if(!m[audience])m[audience]={消耗:0,产出:0};
      m[audience].消耗+=n(r['消费']||r['消耗']||0);
      m[audience].产出+=n(r['7日总支付金额']||r['产出']||0);
    }
    return Object.entries(m).map(([投放人群,v])=>({投放人群,消耗:v.消耗,产出:v.产出,ROI:v.消耗>0?v.产出/v.消耗:0})).sort((a,b)=>b.消耗-a.消耗);
  };
  const selLiveByAudience = useMemo(()=>buildAudience(selLiveRecords),[selLiveRecords]);
  const selShopByAudience = useMemo(()=>buildAudience(selShopRecords),[selShopRecords]);
  const selLiveAudienceStatus = useMemo(()=>{
    if(!selNoteId)return{} as Record<string,boolean>;
    const m:Record<string,boolean>={};
    for(const r of liveCreatives){
      if(String(r['笔记/素材ID']||'')!==selNoteId)continue;
      const audience=String(r['投放人群']||'未知');
      if(VALID_STATUS.includes(String(r['创意状态']||'')))m[audience]=true;
    }
    return m;
  },[selNoteId,liveCreatives]);
  const selShopAudienceStatus = useMemo(()=>{
    if(!selNoteId)return{} as Record<string,boolean>;
    const m:Record<string,boolean>={};
    for(const r of shopCreatives){
      if(String(r['笔记/素材ID']||'')!==selNoteId)continue;
      const audience=String(r['投放人群']||'未知');
      if(VALID_STATUS.includes(String(r['创意状态']||'')))m[audience]=true;
    }
    return m;
  },[selNoteId,shopCreatives]);

  if(loading){
    return <div className="min-h-screen flex items-center justify-center" style={{background:C.bg}}><div className="text-center text-lg" style={{color:C.subtext}}>🦞 加载数据中...</div></div>;
  }

  return (
    <div className="min-h-screen" style={{background:C.bg}}>
      <div className="sticky top-0 z-50 bg-white border-b" style={{borderColor:C.border}}>
        <div className="max-w-7xl mx-auto px-6 pt-3 pb-2 flex items-center gap-4">
          <div className="text-lg font-bold" style={{color:C.primary}}>📊 小红书投放数据</div>
          {projects.length>0&&(
            <select value={currentProjectId} onChange={e=>setCurrentProjectId(e.target.value)}
              className="text-sm border rounded-lg px-3 py-1" style={{borderColor:C.border}}>
              {projects.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          )}
          <button onClick={handleUpdateData} disabled={updateStatus==='loading'}
            className="text-xs px-3 py-1.5 rounded-lg border transition-all flex items-center gap-1"
            style={{
              borderColor: updateStatus==='success'?'#22c55e':updateStatus==='error'?'#ef4444':C.border,
              background: updateStatus==='success'?'#f0fdf4':updateStatus==='error'?'#fef2f2':'white',
              color: updateStatus==='success'?'#22c55e':updateStatus==='error'?'#ef4444':C.subtext,
            }}>
            {updateStatus==='loading'?'⏳ 更新中...':updateStatus==='success'?'✓ 已更新':updateStatus==='error'?'✗ 失败':'更新数据'}
          </button>
          <div className="flex items-center gap-2 ml-auto">
            {[7,14,30].map(d=>{
              const end=dayjs().subtract(1,'day');
              const start=end.subtract(d-1,'day').format('YYYY-MM-DD');
              const endStr=end.format('YYYY-MM-DD');
              const active=dateRange[0]===start&&dateRange[1]===endStr;
              return <button key={d} onClick={()=>setDateRange([start,endStr])}
                className="text-xs px-2 py-1 rounded border transition-colors"
                style={{borderColor:C.border,color:active?C.primary:C.subtext,background:active?C.primary+'15':'transparent'}}>
                近{d}天
              </button>;
            })}
            <input type="date" value={dateRange[0]} onChange={e=>setDateRange([e.target.value,dateRange[1]])}
              className="text-xs border rounded-lg px-2 py-1" style={{borderColor:C.border}} />
            <span className="text-xs" style={{color:C.subtext}}>至</span>
            <input type="date" value={dateRange[1]} onChange={e=>setDateRange([dateRange[0],e.target.value])}
              className="text-xs border rounded-lg px-2 py-1" style={{borderColor:C.border}} />
          </div>
        </div>
        <div className="max-w-7xl mx-auto px-6 pb-2 flex items-center gap-1">
          {(['总览','直播推广','商销推广','产品分析','单篇诊断','笔记总表'] as TabType[]).map(t=>(
            <button key={t} onClick={()=>setTab(t)}
              className="px-4 py-1.5 rounded-full text-sm font-medium transition-all"
              style={{background:tab===t?C.primary:'transparent',color:tab===t?'#fff':C.subtext}}>{t}</button>
          ))}
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-6 space-y-5">

        {tab==='总览'&&(
          <div className="space-y-5">
            <div className="grid grid-cols-4 gap-4">
              <KPICard label="总消耗" value={fmtY(allKPI.消耗)} sub="统计周期内总投放消耗" trend={pctVal(allKPI.消耗,allKPI.消耗*0.9)} />
              <KPICard label="总产出" value={fmtY(allKPI.产出)} sub="7日总支付金额" trend={pctVal(allKPI.产出,allKPI.产出*0.85)} />
              <KPICard label="整体ROI" value={fmtROI(allKPI.ROI)} sub="产出/消耗" />
              <KPICard label="在投笔记" value={String(noteList.filter(n=>n['直播在投']||n['商笔在投']).length)} sub="实时在投状态" />
            </div>
            <Card p={24}>
              <ST title="日消耗产出趋势" />
              <div style={{height:280}}>
                <Line data={{
                  labels:allTrend.map(d=>d.date.slice(5)),
                  datasets:[
                    {type:'bar' as const, label:'消耗', data:allTrend.map(d=>d.消耗), backgroundColor:C.pink+'99', borderRadius:4, yAxisID:'y'},
                    {type:'line' as const, label:'支付ROI', data:allTrend.map(d=>d.roi), borderColor:'#F97316', backgroundColor:'transparent', tension:0.4, yAxisID:'y2', pointRadius:3, pointBackgroundColor:'#F97316'},
                  ] as any[],
                }} options={lineOpts as any} />
              </div>
            </Card>
            <div className="grid grid-cols-2 gap-4">
              <Card p={24}>
                <ST title="营销场景消耗占比" />
                <div style={{height:220}}>
                  <DoughnutSceneShare data={sceneShare} />
                </div>
              </Card>
              <Card p={24}>
                <ST title="直播 vs 商销 对比" />
                <div style={{height:180}}>
                  <Bar data={{
                    labels:['直播推广','商品推广'],
                    datasets:[
                      {label:'消耗',data:[liveKPI.消耗,shopKPI.消耗],backgroundColor:C.pink,borderRadius:8},
                      {label:'产出',data:[liveKPI.产出,shopKPI.产出],backgroundColor:C.blue,borderRadius:8},
                    ],
                  }} options={barOpts as any} />
                </div>
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <div className="text-center p-3 rounded-2xl" style={{background:C.pink+'15'}}>
                    <div className="text-xs mb-1" style={{color:C.subtext}}>直播ROI</div>
                    <div className="text-lg font-bold" style={{color:roiColor(liveKPI.ROI)}}>{fmtROI(liveKPI.ROI)}</div>
                  </div>
                  <div className="text-center p-3 rounded-2xl" style={{background:C.blue+'15'}}>
                    <div className="text-xs mb-1" style={{color:C.subtext}}>商销ROI</div>
                    <div className="text-lg font-bold" style={{color:roiColor(shopKPI.ROI)}}>{fmtROI(shopKPI.ROI)}</div>
                  </div>
                </div>
              </Card>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Card p={24}>
                <ST title="笔记类型消耗占比" />
                <div style={{height:220}}>
                  <DoughnutSceneShare data={noteTypeSpend} />
                </div>
              </Card>
              <Card p={24}>
                <ST title="视频 vs 图文 对比" />
                <div style={{height:180}}>
                  <Bar data={{
                    labels:['视频笔记','图文笔记'],
                    datasets:[
                      {label:'消耗',data:[videoVsImage.视频.消耗,videoVsImage.图文.消耗],backgroundColor:C.pink,borderRadius:8},
                      {label:'产出',data:[videoVsImage.视频.产出,videoVsImage.图文.产出],backgroundColor:C.blue,borderRadius:8},
                    ],
                  }} options={barOpts as any} />
                </div>
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <div className="text-center p-3 rounded-2xl" style={{background:C.pink+'15'}}>
                    <div className="text-xs mb-1" style={{color:C.subtext}}>视频ROI</div>
                    <div className="text-lg font-bold" style={{color:roiColor(videoVsImage.视频.ROI)}}>{fmtROI(videoVsImage.视频.ROI)}</div>
                  </div>
                  <div className="text-center p-3 rounded-2xl" style={{background:C.blue+'15'}}>
                    <div className="text-xs mb-1" style={{color:C.subtext}}>图文ROI</div>
                    <div className="text-lg font-bold" style={{color:roiColor(videoVsImage.图文.ROI)}}>{fmtROI(videoVsImage.图文.ROI)}</div>
                  </div>
                </div>
              </Card>
            </div>
          </div>
        )}

        {tab==='直播推广'&&(
          <div className="space-y-5">
            <div className="grid grid-cols-4 gap-4">
              <KPICard label="直播消耗" value={fmtY(liveKPI.消耗)} sub="直播推广总消耗" trend={pctVal(liveKPI.消耗,liveKPI.消耗*0.88)} />
              <KPICard label="直播产出" value={fmtY(liveKPI.产出)} sub="7日总支付金额" trend={pctVal(liveKPI.产出,liveKPI.产出*0.9)} />
              <KPICard label="直播ROI" value={fmtROI(liveKPI.ROI)} sub="产出/消耗" />
              <KPICard label="直播在投" value={String(noteList.filter(n=>n['直播在投']).length)} sub="实时直播在投状态" />
            </div>
            <Card p={24}>
              <ST title="直播日消耗产出趋势" />
              <div style={{height:280}}>
                <Line data={{
                  labels:liveTrend.map(d=>d.date.slice(5)),
                  datasets:[
                    {type:'bar' as const, label:'消耗', data:liveTrend.map(d=>d.消耗), backgroundColor:C.pink+'99', borderRadius:4, yAxisID:'y'},
                    {type:'line' as const, label:'支付ROI', data:liveTrend.map(d=>d.roi), borderColor:'#F97316', backgroundColor:'transparent', tension:0.4, yAxisID:'y2', pointRadius:3, pointBackgroundColor:'#F97316'},
                  ] as any[],
                }} options={lineOpts as any} />
              </div>
            </Card>
            <Card p={24}>
              <div className="flex items-center justify-between mb-3">
                <ST title="直播笔记列表" />
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="flex rounded-lg overflow-hidden border" style={{borderColor:C.border}}>
                    <button onClick={()=>{setLiveNoteStatusFilter('全部');setLivePage(1);}} className={`px-3 py-1 text-xs ${liveNoteStatusFilter==='全部'?'bg-blue-500 text-white':'bg-white text-gray-700'}`}>全部</button>
                    <button onClick={()=>{setLiveNoteStatusFilter('直播');setLivePage(1);}} className={`px-3 py-1 text-xs border-l ${liveNoteStatusFilter==='直播'?'bg-blue-500 text-white':'bg-white text-gray-700'}`} style={{borderColor:C.border}}>直播</button>
                    <button onClick={()=>{setLiveNoteStatusFilter('商销');setLivePage(1);}} className={`px-3 py-1 text-xs border-l ${liveNoteStatusFilter==='商销'?'bg-blue-500 text-white':'bg-white text-gray-700'}`} style={{borderColor:C.border}}>商销</button>
                  </div>
                  <span className="text-xs" style={{color:C.subtext}}>产品:</span>
                  <select value={liveProductFilter} onChange={e=>{setLiveProductFilter(e.target.value);setLivePage(1);}}
                    className="text-xs border rounded-lg px-2 py-1" style={{borderColor:C.border}}>
                    {liveNoteProducts.map(p=><option key={p} value={p}>{p}</option>)}
                  </select>
                  <span className="text-xs" style={{color:C.subtext}}>方向:</span>
                  <select value={liveDirFilter} onChange={e=>{setLiveDirFilter(e.target.value);setLivePage(1);}}
                    className="text-xs border rounded-lg px-2 py-1" style={{borderColor:C.border}}>
                    {liveNoteDirs.map(d=><option key={d} value={d}>{d}</option>)}
                  </select>
                  <span className="text-xs" style={{color:C.subtext}}>评级:</span>
                  <div className="flex rounded-lg overflow-hidden border" style={{borderColor:C.border}}>
                    {['全部',...noteStandards.map(s=>s.评级)].map(r=>(
                      <button key={r} onClick={()=>{setLiveRatingFilter(r);setLivePage(1);}}
                        className={`px-2.5 py-1 text-xs ${liveRatingFilter===r?'bg-blue-500 text-white':'bg-white text-gray-700'}`}
                        style={{borderLeft:r!=='全部'?'1px solid '+C.border:'none'}}>{r}</button>
                    ))}
                  </div>
                  <span className="text-xs px-3 py-1 rounded-full bg-green-100 text-green-700">{filteredLiveNotes.length} 篇</span>
                </div>
              </div>
              <NoteTable notes={pagedLiveNotes.list} onRowClick={(id)=>{setSelNoteId(id);setTab('单篇诊断');}} sortField={liveSortField} sortDir={liveSortDir} onSort={(f)=>{setLiveSortField(f);setLiveSortDir(liveSortField===f&&liveSortDir==='desc'?'asc':'desc');setLivePage(1);}} />
              <div className="flex items-center justify-between mt-4">
                <span className="text-xs" style={{color:C.subtext}}>第{(livePage-1)*PAGE_SIZE+1}-{Math.min(livePage*PAGE_SIZE,pagedLiveNotes.total)}条，共{pagedLiveNotes.total}条</span>
                <div className="flex gap-2">
                  <button onClick={()=>setLivePage(p=>Math.max(1,p-1))} className="px-3 py-1 text-xs border rounded-lg" style={{borderColor:C.border}} disabled={livePage===1}>上一页</button>
                  <button onClick={()=>setLivePage(p=>p+1)} className="px-3 py-1 text-xs border rounded-lg" style={{borderColor:C.border}} disabled={livePage*PAGE_SIZE>=pagedLiveNotes.total}>下一页</button>
                </div>
              </div>
            </Card>

            <Card p={24}>
              <ST title="直播推广 - 各产品数据" />
              <table className="w-full text-sm">
                <thead><tr style={{borderBottom:"1px solid "+C.border}}>
                  {["产品","笔记数","消耗","产出","支付ROI","消耗占比"].map(h=>(
                    <th key={h} className="text-left py-2 px-3 text-xs font-medium" style={{color:C.subtext}}>{h}</th>))}
                </tr></thead>
                <tbody>
                  {liveByProduct.map(row=>{
                    const share=liveKPI.消耗>0?(row.消耗/liveKPI.消耗*100):0;
                    return (
                      <tr key={row.产品} style={{borderBottom:"1px solid "+C.border}}>
                        <td className="py-2 px-3 text-sm font-medium" style={{color:C.text}}>{row.产品}</td>
                        <td className="py-2 px-3 text-sm">{row.笔记数}</td>
                        <td className="py-2 px-3 text-sm" style={{color:C.pink}}>{fmtY(row.消耗)}</td>
                        <td className="py-2 px-3 text-sm" style={{color:C.blue}}>{fmtY(row.产出)}</td>
                        <td className="py-2 px-3 text-sm font-bold" style={{color:roiColor(row.ROI)}}>{fmtROI(row.ROI)}</td>
                        <td className="py-2 px-3 text-sm">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 bg-gray-100 rounded-full h-1.5"><div className="h-1.5 rounded-full" style={{width:share+"%",background:C.pink}} /></div>
                            <span className="text-xs w-10 text-right" style={{color:C.subtext}}>{share.toFixed(1)}%</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {liveByProduct.length>0&&(()=>{
                    const total=liveByProduct.reduce((a,b)=>({笔记数:a.笔记数+b.笔记数,消耗:a.消耗+b.消耗,产出:a.产出+b.产出}),{笔记数:0,消耗:0,产出:0});
                    const roi=total.消耗>0?total.产出/total.消耗:0;
                    return (
                      <tr key="total" style={{borderBottom:"1px solid "+C.border,background:C.bg}}>
                        <td className="py-2 px-3 text-sm font-bold" style={{color:C.text}}>总计</td>
                        <td className="py-2 px-3 text-sm font-bold">{total.笔记数}</td>
                        <td className="py-2 px-3 text-sm font-bold" style={{color:C.pink}}>{fmtY(total.消耗)}</td>
                        <td className="py-2 px-3 text-sm font-bold" style={{color:C.blue}}>{fmtY(total.产出)}</td>
                        <td className="py-2 px-3 text-sm font-bold" style={{color:roiColor(roi)}}>{fmtROI(roi)}</td>
                        <td className="py-2 px-3 text-sm font-bold" style={{color:C.subtext}}>100%</td>
                      </tr>
                    );
                  })()}
                </tbody>
              </table>
            </Card>

            <Card p={24}>
              <ST title="直播推广 - 各内容方向数据" />
              <table className="w-full text-sm">
                <thead><tr style={{borderBottom:"1px solid "+C.border}}>
                  {["内容方向","笔记数","消耗","产出","支付ROI","消耗占比"].map(h=>(
                    <th key={h} className="text-left py-2 px-3 text-xs font-medium" style={{color:C.subtext}}>{h}</th>))}
                </tr></thead>
                <tbody>
                  {liveByDir.map(row=>{
                    const share=liveKPI.消耗>0?(row.消耗/liveKPI.消耗*100):0;
                    return (
                      <tr key={row.内容方向} style={{borderBottom:"1px solid "+C.border}}>
                        <td className="py-2 px-3 text-sm font-medium" style={{color:C.text}}>{row.内容方向}</td>
                        <td className="py-2 px-3 text-sm">{row.笔记数}</td>
                        <td className="py-2 px-3 text-sm" style={{color:C.pink}}>{fmtY(row.消耗)}</td>
                        <td className="py-2 px-3 text-sm" style={{color:C.blue}}>{fmtY(row.产出)}</td>
                        <td className="py-2 px-3 text-sm font-bold" style={{color:roiColor(row.ROI)}}>{fmtROI(row.ROI)}</td>
                        <td className="py-2 px-3 text-sm">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 bg-gray-100 rounded-full h-1.5"><div className="h-1.5 rounded-full" style={{width:share+"%",background:C.pink}} /></div>
                            <span className="text-xs w-10 text-right" style={{color:C.subtext}}>{share.toFixed(1)}%</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {liveByDir.length>0&&(()=>{
                    const total=liveByDir.reduce((a,b)=>({笔记数:a.笔记数+b.笔记数,消耗:a.消耗+b.消耗,产出:a.产出+b.产出}),{笔记数:0,消耗:0,产出:0});
                    const roi=total.消耗>0?total.产出/total.消耗:0;
                    return (
                      <tr key="total" style={{borderBottom:"1px solid "+C.border,background:C.bg}}>
                        <td className="py-2 px-3 text-sm font-bold" style={{color:C.text}}>总计</td>
                        <td className="py-2 px-3 text-sm font-bold">{total.笔记数}</td>
                        <td className="py-2 px-3 text-sm font-bold" style={{color:C.pink}}>{fmtY(total.消耗)}</td>
                        <td className="py-2 px-3 text-sm font-bold" style={{color:C.blue}}>{fmtY(total.产出)}</td>
                        <td className="py-2 px-3 text-sm font-bold" style={{color:roiColor(roi)}}>{fmtROI(roi)}</td>
                        <td className="py-2 px-3 text-sm font-bold" style={{color:C.subtext}}>100%</td>
                      </tr>
                    );
                  })()}
                </tbody>
              </table>
            </Card>
          </div>
        )}

        {tab==='商销推广'&&(
          <div className="space-y-5">
            <div className="grid grid-cols-4 gap-4">
              <KPICard label="商销消耗" value={fmtY(shopKPI.消耗)} sub="商品推广总消耗" trend={pctVal(shopKPI.消耗,shopKPI.消耗*0.9)} />
              <KPICard label="商销产出" value={fmtY(shopKPI.产出)} sub="7日总支付金额" trend={pctVal(shopKPI.产出,shopKPI.产出*0.88)} />
              <KPICard label="商销ROI" value={fmtROI(shopKPI.ROI)} sub="产出/消耗" />
              <KPICard label="商笔在投" value={String(noteList.filter(n=>n['商笔在投']).length)} sub="实时商笔在投状态" />
            </div>
            <Card p={24}>
              <ST title="商销日消耗产出趋势" />
              <div style={{height:280}}>
                <Line data={{
                  labels:shopTrend.map(d=>d.date.slice(5)),
                  datasets:[
                    {type:'bar' as const, label:'消耗', data:shopTrend.map(d=>d.消耗), backgroundColor:C.orange+'99', borderRadius:4, yAxisID:'y'},
                    {type:'line' as const, label:'支付ROI', data:shopTrend.map(d=>d.roi), borderColor:'#F97316', backgroundColor:'transparent', tension:0.4, yAxisID:'y2', pointRadius:3, pointBackgroundColor:'#F97316'},
                  ] as any[],
                }} options={lineOpts as any} />
              </div>
            </Card>
            <Card p={24}>
              <div className="flex items-center justify-between mb-3">
                <ST title="商笔笔记列表" />
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="flex rounded-lg overflow-hidden border" style={{borderColor:C.border}}>
                    <button onClick={()=>{setShopNoteStatusFilter('全部');setShopPage(1);}} className={`px-3 py-1 text-xs ${shopNoteStatusFilter==='全部'?'bg-blue-500 text-white':'bg-white text-gray-700'}`}>全部</button>
                    <button onClick={()=>{setShopNoteStatusFilter('直播');setShopPage(1);}} className={`px-3 py-1 text-xs border-l ${shopNoteStatusFilter==='直播'?'bg-blue-500 text-white':'bg-white text-gray-700'}`} style={{borderColor:C.border}}>直播</button>
                    <button onClick={()=>{setShopNoteStatusFilter('商销');setShopPage(1);}} className={`px-3 py-1 text-xs border-l ${shopNoteStatusFilter==='商销'?'bg-blue-500 text-white':'bg-white text-gray-700'}`} style={{borderColor:C.border}}>商销</button>
                  </div>
                  <span className="text-xs" style={{color:C.subtext}}>产品:</span>
                  <select value={shopProductFilter} onChange={e=>{setShopProductFilter(e.target.value);setShopPage(1);}}
                    className="text-xs border rounded-lg px-2 py-1" style={{borderColor:C.border}}>
                    {shopNoteProducts.map(p=><option key={p} value={p}>{p}</option>)}
                  </select>
                  <span className="text-xs" style={{color:C.subtext}}>方向:</span>
                  <select value={shopDirFilter} onChange={e=>{setShopDirFilter(e.target.value);setShopPage(1);}}
                    className="text-xs border rounded-lg px-2 py-1" style={{borderColor:C.border}}>
                    {shopNoteDirs.map(d=><option key={d} value={d}>{d}</option>)}
                  </select>
                  <span className="text-xs" style={{color:C.subtext}}>评级:</span>
                  <div className="flex rounded-lg overflow-hidden border" style={{borderColor:C.border}}>
                    {['全部',...noteStandards.map(s=>s.评级)].map(r=>(
                      <button key={r} onClick={()=>{setShopRatingFilter(r);setShopPage(1);}}
                        className={`px-2.5 py-1 text-xs ${shopRatingFilter===r?'bg-blue-500 text-white':'bg-white text-gray-700'}`}
                        style={{borderLeft:r!=='全部'?'1px solid '+C.border:'none'}}>{r}</button>
                    ))}
                  </div>
                  <span className="text-xs px-3 py-1 rounded-full bg-green-100 text-green-700">{filteredShopNotes.length} 篇</span>
                </div>
              </div>
              <NoteTable notes={pagedShopNotes.list} onRowClick={(id)=>{setSelNoteId(id);setTab('单篇诊断');}} sortField={shopSortField} sortDir={shopSortDir} onSort={(f)=>{setShopSortField(f);setShopSortDir(shopSortField===f&&shopSortDir==='desc'?'asc':'desc');setShopPage(1);}} />
              <div className="flex items-center justify-between mt-4">
                <span className="text-xs" style={{color:C.subtext}}>第{(shopPage-1)*PAGE_SIZE+1}-{Math.min(shopPage*PAGE_SIZE,pagedShopNotes.total)}条，共{pagedShopNotes.total}条</span>
                <div className="flex gap-2">
                  <button onClick={()=>setShopPage(p=>Math.max(1,p-1))} className="px-3 py-1 text-xs border rounded-lg" style={{borderColor:C.border}} disabled={shopPage===1}>上一页</button>
                  <button onClick={()=>setShopPage(p=>p+1)} className="px-3 py-1 text-xs border rounded-lg" style={{borderColor:C.border}} disabled={shopPage*PAGE_SIZE>=pagedShopNotes.total}>下一页</button>
                </div>
              </div>
            </Card>
            <Card p={24}>
              <ST title="商销推广 - 各产品数据" />
              <table className="w-full text-sm">
                <thead><tr style={{borderBottom:"1px solid "+C.border}}>
                  {["产品","笔记数","消耗","产出","支付ROI","消耗占比"].map(h=>(
                    <th key={h} className="text-left py-2 px-3 text-xs font-medium" style={{color:C.subtext}}>{h}</th>))}
                </tr></thead>
                <tbody>
                  {shopByProduct.map(row=>{
                    const share=shopKPI.消耗>0?(row.消耗/shopKPI.消耗*100):0;
                    return (
                      <tr key={row.产品} style={{borderBottom:"1px solid "+C.border}}>
                        <td className="py-2 px-3 text-sm font-medium" style={{color:C.text}}>{row.产品}</td>
                        <td className="py-2 px-3 text-sm">{row.笔记数}</td>
                        <td className="py-2 px-3 text-sm" style={{color:C.pink}}>{fmtY(row.消耗)}</td>
                        <td className="py-2 px-3 text-sm" style={{color:C.blue}}>{fmtY(row.产出)}</td>
                        <td className="py-2 px-3 text-sm font-bold" style={{color:roiColor(row.ROI)}}>{fmtROI(row.ROI)}</td>
                        <td className="py-2 px-3 text-sm">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 bg-gray-100 rounded-full h-1.5"><div className="h-1.5 rounded-full" style={{width:share+"%",background:C.pink}} /></div>
                            <span className="text-xs w-10 text-right" style={{color:C.subtext}}>{share.toFixed(1)}%</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {shopByProduct.length>0&&(()=>{
                    const total=shopByProduct.reduce((a,b)=>({笔记数:a.笔记数+b.笔记数,消耗:a.消耗+b.消耗,产出:a.产出+b.产出}),{笔记数:0,消耗:0,产出:0});
                    const roi=total.消耗>0?total.产出/total.消耗:0;
                    return (
                      <tr key="total" style={{borderBottom:"1px solid "+C.border,background:C.bg}}>
                        <td className="py-2 px-3 text-sm font-bold" style={{color:C.text}}>总计</td>
                        <td className="py-2 px-3 text-sm font-bold">{total.笔记数}</td>
                        <td className="py-2 px-3 text-sm font-bold" style={{color:C.pink}}>{fmtY(total.消耗)}</td>
                        <td className="py-2 px-3 text-sm font-bold" style={{color:C.blue}}>{fmtY(total.产出)}</td>
                        <td className="py-2 px-3 text-sm font-bold" style={{color:roiColor(roi)}}>{fmtROI(roi)}</td>
                        <td className="py-2 px-3 text-sm font-bold" style={{color:C.subtext}}>100%</td>
                      </tr>
                    );
                  })()}
                </tbody>
              </table>
            </Card>
            <Card p={24}>
              <ST title="商销推广 - 各内容方向数据" />
              <table className="w-full text-sm">
                <thead><tr style={{borderBottom:"1px solid "+C.border}}>
                  {["内容方向","笔记数","消耗","产出","支付ROI","消耗占比"].map(h=>(
                    <th key={h} className="text-left py-2 px-3 text-xs font-medium" style={{color:C.subtext}}>{h}</th>))}
                </tr></thead>
                <tbody>
                  {shopByDir.map(row=>{
                    const share=shopKPI.消耗>0?(row.消耗/shopKPI.消耗*100):0;
                    return (
                      <tr key={row.内容方向} style={{borderBottom:"1px solid "+C.border}}>
                        <td className="py-2 px-3 text-sm font-medium" style={{color:C.text}}>{row.内容方向}</td>
                        <td className="py-2 px-3 text-sm">{row.笔记数}</td>
                        <td className="py-2 px-3 text-sm" style={{color:C.pink}}>{fmtY(row.消耗)}</td>
                        <td className="py-2 px-3 text-sm" style={{color:C.blue}}>{fmtY(row.产出)}</td>
                        <td className="py-2 px-3 text-sm font-bold" style={{color:roiColor(row.ROI)}}>{fmtROI(row.ROI)}</td>
                        <td className="py-2 px-3 text-sm">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 bg-gray-100 rounded-full h-1.5"><div className="h-1.5 rounded-full" style={{width:share+"%",background:C.pink}} /></div>
                            <span className="text-xs w-10 text-right" style={{color:C.subtext}}>{share.toFixed(1)}%</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {shopByDir.length>0&&(()=>{
                    const total=shopByDir.reduce((a,b)=>({笔记数:a.笔记数+b.笔记数,消耗:a.消耗+b.消耗,产出:a.产出+b.产出}),{笔记数:0,消耗:0,产出:0});
                    const roi=total.消耗>0?total.产出/total.消耗:0;
                    return (
                      <tr key="total" style={{borderBottom:"1px solid "+C.border,background:C.bg}}>
                        <td className="py-2 px-3 text-sm font-bold" style={{color:C.text}}>总计</td>
                        <td className="py-2 px-3 text-sm font-bold">{total.笔记数}</td>
                        <td className="py-2 px-3 text-sm font-bold" style={{color:C.pink}}>{fmtY(total.消耗)}</td>
                        <td className="py-2 px-3 text-sm font-bold" style={{color:C.blue}}>{fmtY(total.产出)}</td>
                        <td className="py-2 px-3 text-sm font-bold" style={{color:roiColor(roi)}}>{fmtROI(roi)}</td>
                        <td className="py-2 px-3 text-sm font-bold" style={{color:C.subtext}}>100%</td>
                      </tr>
                    );
                  })()}
                </tbody>
              </table>
            </Card>
          </div>
        )}

        {tab==='单篇诊断'&&(
          <div className="space-y-5">
            <Card p={24}>
              <ST title="输入笔记ID查询" />
              <div className="flex gap-3 mb-4">
                <input type="text" placeholder="输入笔记ID，按回车查询"
                  value={selNoteId} onChange={e=>setSelNoteId(e.target.value)}
                  className="flex-1 border rounded-xl px-4 py-2 text-sm outline-none"
                  style={{borderColor:C.border}} />
              </div>
              {!selNote?(
                <div className="text-center py-12 text-sm" style={{color:C.subtext}}>请输入笔记ID或点击上方列表中的笔记</div>
              ):(
                <div className="space-y-4">
                  <div className="grid grid-cols-4 gap-3">
                    <div className="p-4 rounded-2xl" style={{background:C.pink+'15'}}>
                      <div className="text-xs mb-1" style={{color:C.subtext}}>笔记类型</div>
                      <div className="text-sm font-semibold" style={{color:C.text}}>{String(selNote['笔记类型'])||'-'}</div>
                    </div>
                    <div className="p-4 rounded-2xl" style={{background:C.blue+'15'}}>
                      <div className="text-xs mb-1" style={{color:C.subtext}}>产品</div>
                      <div className="text-sm font-semibold" style={{color:C.text}}>{String(selNote['产品'])||'-'}</div>
                    </div>
                    <div className="p-4 rounded-2xl" style={{background:C.orange+'15'}}>
                      <div className="text-xs mb-1" style={{color:C.subtext}}>直播状态</div>
                      <div className="text-sm font-semibold" style={{color:selNote['直播在投']?'#22c55e':'#ef4444'}}>{selNote['直播在投']?'直播在投':'未在投'}</div>
                    </div>
                    <div className="p-4 rounded-2xl" style={{background:C.purple+'15'}}>
                      <div className="text-xs mb-1" style={{color:C.subtext}}>商笔状态</div>
                      <div className="text-sm font-semibold" style={{color:selNote['商笔在投']?'#22c55e':'#ef4444'}}>{selNote['商笔在投']?'商笔在投':'未在投'}</div>
                    </div>
                  </div>

                  {/* 直播推广数据 */}
                  {selLiveRecords.length>0&&(
                    <div className="mt-4 p-4 rounded-2xl" style={{background:C.orange+'08',border:'1px solid '+C.border}}>
                      <ST title="直播推广" />
                      <div className="grid grid-cols-3 gap-4 mt-3">
                        <div className="p-4 rounded-2xl text-center" style={{background:C.pink+'15'}}>
                          <div className="text-xs mb-1" style={{color:C.subtext}}>直播消耗</div>
                          <div className="text-xl font-bold" style={{color:C.text}}>{fmtY(selLiveKPI.消耗)}</div>
                        </div>
                        <div className="p-4 rounded-2xl text-center" style={{background:C.blue+'15'}}>
                          <div className="text-xs mb-1" style={{color:C.subtext}}>直播产出</div>
                          <div className="text-xl font-bold" style={{color:C.text}}>{fmtY(selLiveKPI.产出)}</div>
                        </div>
                        <div className="p-4 rounded-2xl text-center" style={{background:C.green+'15'}}>
                          <div className="text-xs mb-1" style={{color:C.subtext}}>直播ROI</div>
                          <div className="text-xl font-bold" style={{color:roiColor(selLiveKPI.ROI)}}>{fmtROI(selLiveKPI.ROI)}</div>
                        </div>
                      </div>
                      {selLiveByAudience.length>0&&(
                        <div className="mt-3">
                          <div className="text-xs font-medium mb-1" style={{color:C.subtext}}>投放人群</div>
                          <table className="w-full text-sm">
                            <thead><tr style={{borderBottom:"1px solid "+C.border}}>
                              {['投放人群','在投状态','消耗','支付金额','支付ROI'].map(h=>(
                                <th key={h} className="text-left py-2 px-3 text-xs font-medium" style={{color:C.subtext}}>{h}</th>
                              ))}
                            </tr></thead>
                            <tbody>
                              {selLiveByAudience.map(row=>{
                                const active=selLiveAudienceStatus[row.投放人群];
                                return(
                                <tr key={row.投放人群} style={{borderBottom:"1px solid "+C.border}}>
                                  <td className="py-2 px-3 text-xs font-medium" style={{color:C.text}}>{row.投放人群}</td>
                                  <td className="py-2 px-3"><span className="px-2 py-0.5 rounded-full text-xs" style={{background:active?'#dcfce7':'#fee2e2',color:active?'#16a34a':'#dc2626'}}>{active?'在投':'未在投'}</span></td>
                                  <td className="py-2 px-3 text-xs" style={{color:C.pink}}>{fmtY(row.消耗)}</td>
                                  <td className="py-2 px-3 text-xs" style={{color:C.blue}}>{fmtY(row.产出)}</td>
                                  <td className="py-2 px-3 text-xs font-bold" style={{color:roiColor(row.ROI)}}>{fmtROI(row.ROI)}</td>
                                </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}
                      <div style={{height:200}} className="mt-3">
                        <Line data={{
                          labels:selLiveRecords.map(r=>String(r['时间']||r['日期']||'').slice(0,10)),
                          datasets:[
                            {label:'消耗',data:selLiveRecords.map(r=>n(r['消费']||r['消耗']||0)),borderColor:C.pink,backgroundColor:C.pink+'22',fill:true,tension:0.4},
                            {label:'产出',data:selLiveRecords.map(r=>n(r['7日总支付金额']||r['产出']||0)),borderColor:C.blue,backgroundColor:C.blue+'22',fill:true,tension:0.4},
                          ],
                        }} options={lineOpts as any} />
                      </div>
                    </div>
                  )}

                  {/* 商销推广数据 */}
                  {selShopRecords.length>0&&(
                    <div className="mt-4 p-4 rounded-2xl" style={{background:C.purple+'08',border:'1px solid '+C.border}}>
                      <ST title="商销推广" />
                      <div className="grid grid-cols-3 gap-4 mt-3">
                        <div className="p-4 rounded-2xl text-center" style={{background:C.pink+'15'}}>
                          <div className="text-xs mb-1" style={{color:C.subtext}}>商销消耗</div>
                          <div className="text-xl font-bold" style={{color:C.text}}>{fmtY(selShopKPI.消耗)}</div>
                        </div>
                        <div className="p-4 rounded-2xl text-center" style={{background:C.blue+'15'}}>
                          <div className="text-xs mb-1" style={{color:C.subtext}}>商销产出</div>
                          <div className="text-xl font-bold" style={{color:C.text}}>{fmtY(selShopKPI.产出)}</div>
                        </div>
                        <div className="p-4 rounded-2xl text-center" style={{background:C.green+'15'}}>
                          <div className="text-xs mb-1" style={{color:C.subtext}}>商销ROI</div>
                          <div className="text-xl font-bold" style={{color:roiColor(selShopKPI.ROI)}}>{fmtROI(selShopKPI.ROI)}</div>
                        </div>
                      </div>
                      {selShopByAudience.length>0&&(
                        <div className="mt-3">
                          <div className="text-xs font-medium mb-1" style={{color:C.subtext}}>投放人群</div>
                          <table className="w-full text-sm">
                            <thead><tr style={{borderBottom:"1px solid "+C.border}}>
                              {['投放人群','在投状态','消耗','支付金额','支付ROI'].map(h=>(
                                <th key={h} className="text-left py-2 px-3 text-xs font-medium" style={{color:C.subtext}}>{h}</th>
                              ))}
                            </tr></thead>
                            <tbody>
                              {selShopByAudience.map(row=>{
                                const active=selShopAudienceStatus[row.投放人群];
                                return(
                                <tr key={row.投放人群} style={{borderBottom:"1px solid "+C.border}}>
                                  <td className="py-2 px-3 text-xs font-medium" style={{color:C.text}}>{row.投放人群}</td>
                                  <td className="py-2 px-3"><span className="px-2 py-0.5 rounded-full text-xs" style={{background:active?'#dcfce7':'#fee2e2',color:active?'#16a34a':'#dc2626'}}>{active?'在投':'未在投'}</span></td>
                                  <td className="py-2 px-3 text-xs" style={{color:C.pink}}>{fmtY(row.消耗)}</td>
                                  <td className="py-2 px-3 text-xs" style={{color:C.blue}}>{fmtY(row.产出)}</td>
                                  <td className="py-2 px-3 text-xs font-bold" style={{color:roiColor(row.ROI)}}>{fmtROI(row.ROI)}</td>
                                </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}
                      <div style={{height:200}} className="mt-3">
                        <Line data={{
                          labels:selShopRecords.map(r=>String(r['时间']||r['日期']||'').slice(0,10)),
                          datasets:[
                            {label:'消耗',data:selShopRecords.map(r=>n(r['消费']||r['消耗']||0)),borderColor:C.pink,backgroundColor:C.pink+'22',fill:true,tension:0.4},
                            {label:'产出',data:selShopRecords.map(r=>n(r['7日总支付金额']||r['产出']||0)),borderColor:C.blue,backgroundColor:C.blue+'22',fill:true,tension:0.4},
                          ],
                        }} options={lineOpts as any} />
                      </div>
                    </div>
                  )}

                  {selLiveRecords.length===0&&selShopRecords.length===0&&(
                    <div className="text-center py-8 text-sm" style={{color:C.subtext}}>该笔记在选定时间范围内无投放数据</div>
                  )}
                </div>
              )}
            </Card>
          </div>
        )}

        {tab==='产品分析'&&(
          <div className="space-y-5">
            <Card p={24}>
              <ST title="产品汇总" sub={`共 ${allByProduct.length} 个产品`} />
              <table className="w-full text-sm mt-3">
                <thead><tr style={{borderBottom:"1px solid "+C.border}}>
                  {['产品','直播消耗','直播ROI','商销消耗','商销ROI','总消耗','总ROI','占比'].map(h=>(
                    <th key={h} className="text-left py-2 px-3 text-xs font-medium" style={{color:C.subtext}}>{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {allByProduct.map(row=>(
                    <tr key={row.产品} onClick={()=>{setProdTab(row.产品);setProdPage(1);}} className="cursor-pointer" style={{borderBottom:"1px solid "+C.border,background:prodTab===row.产品?C.primary+'10':'transparent'}}>
                      <td className="py-2 px-3 text-xs font-medium" style={{color:prodTab===row.产品?C.primary:C.text}}>{row.产品}</td>
                      <td className="py-2 px-3 text-xs" style={{color:C.pink}}>{fmtY(row.直播消耗)}</td>
                      <td className="py-2 px-3 text-xs font-bold" style={{color:roiColor(row.直播ROI)}}>{fmtROI(row.直播ROI)}</td>
                      <td className="py-2 px-3 text-xs" style={{color:C.orange}}>{fmtY(row.商销消耗)}</td>
                      <td className="py-2 px-3 text-xs font-bold" style={{color:roiColor(row.商销ROI)}}>{fmtROI(row.商销ROI)}</td>
                      <td className="py-2 px-3 text-xs font-medium" style={{color:C.text}}>{fmtY(row.总消耗)}</td>
                      <td className="py-2 px-3 text-xs font-bold" style={{color:roiColor(row.总ROI)}}>{fmtROI(row.总ROI)}</td>
                      <td className="py-2 px-3 text-xs" style={{color:C.text}}>{(row.占比*100).toFixed(1)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>

            {prodTab&&(
              <div className="space-y-5">
                <div className="grid grid-cols-3 gap-4">
                  <KPICard label="直播消耗" value={fmtY(prodLiveKPI.消耗)} sub="直播推广总消耗" />
                  <KPICard label="直播产出" value={fmtY(prodLiveKPI.产出)} sub="7日总支付金额" />
                  <KPICard label="直播ROI" value={fmtROI(prodLiveKPI.ROI)} sub="产出/消耗" />
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <KPICard label="商销消耗" value={fmtY(prodShopKPI.消耗)} sub="商品推广总消耗" />
                  <KPICard label="商销产出" value={fmtY(prodShopKPI.产出)} sub="7日总支付金额" />
                  <KPICard label="商销ROI" value={fmtROI(prodShopKPI.ROI)} sub="产出/消耗" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <Card p={24}>
                    <ST title="直播日消耗产出趋势" />
                    <div style={{height:260}}>
                      {prodLiveTrend.length>0?(
                        <Line data={{
                          labels:prodLiveTrend.map(d=>d.date.slice(5)),
                          datasets:[
                            {type:'bar' as const, label:'消耗', data:prodLiveTrend.map(d=>d.消耗), backgroundColor:C.pink+'99', borderRadius:4, yAxisID:'y'},
                            {type:'line' as const, label:'支付ROI', data:prodLiveTrend.map(d=>d.roi), borderColor:'#F97316', backgroundColor:'transparent', tension:0.4, yAxisID:'y2', pointRadius:3, pointBackgroundColor:'#F97316'},
                          ] as any[],
                        }} options={lineOpts as any} />
                      ):<div className="flex items-center justify-center h-full text-sm" style={{color:C.subtext}}>暂无数据</div>}
                    </div>
                  </Card>
                  <Card p={24}>
                    <ST title="商销日消耗产出趋势" />
                    <div style={{height:260}}>
                      {prodShopTrend.length>0?(
                        <Line data={{
                          labels:prodShopTrend.map(d=>d.date.slice(5)),
                          datasets:[
                            {type:'bar' as const, label:'消耗', data:prodShopTrend.map(d=>d.消耗), backgroundColor:C.orange+'99', borderRadius:4, yAxisID:'y'},
                            {type:'line' as const, label:'支付ROI', data:prodShopTrend.map(d=>d.roi), borderColor:'#F97316', backgroundColor:'transparent', tension:0.4, yAxisID:'y2', pointRadius:3, pointBackgroundColor:'#F97316'},
                          ] as any[],
                        }} options={lineOpts as any} />
                      ):<div className="flex items-center justify-center h-full text-sm" style={{color:C.subtext}}>暂无数据</div>}
                    </div>
                  </Card>
                </div>
                <Card p={24}>
                  <div className="flex items-center justify-between mb-3">
                    <ST title={`${prodTab} 直播笔记`} sub={`共 ${pagedProdLiveNotes.total} 篇`} />

                    <div className="flex rounded-lg overflow-hidden border" style={{borderColor:C.border}}>
                      <button onClick={()=>{setProdSortField('消耗');setProdSortDir(prodSortField==='消耗'&&prodSortDir==='desc'?'asc':'desc');setProdPage(1);}}
                        className={`px-3 py-1 text-xs ${prodSortField==='消耗'?'bg-blue-500 text-white':'bg-white text-gray-700'}`}>
                        消耗{prodSortField==='消耗'?(prodSortDir==='desc'?' ↓':' ↑'):''}
                      </button>
                      <button onClick={()=>{setProdSortField('ROI');setProdSortDir(prodSortField==='ROI'&&prodSortDir==='desc'?'asc':'desc');setProdPage(1);}}
                        className={`px-3 py-1 text-xs border-l ${prodSortField==='ROI'?'bg-blue-500 text-white':'bg-white text-gray-700'}`} style={{borderColor:C.border}}>
                        ROI{prodSortField==='ROI'?(prodSortDir==='desc'?' ↓':' ↑'):''}
                      </button>
                    </div>
                  </div>
                  <table className="w-full text-sm">
                    <thead><tr style={{borderBottom:"1px solid "+C.border}}>
                      {['笔记ID','笔记简称','笔记链接','笔记类型','在投状态','消耗','支付金额','支付ROI','消耗占比','投放开始'].map(h=>(
                        <th key={h} className="text-left py-2 px-3 text-xs font-medium" style={{color:C.subtext}}>{h}</th>
                      ))}
                    </tr></thead>
                    <tbody>
                      {pagedProdLiveNotes.list.map(note=>(
                        <tr key={String(note['笔记ID'])} className="cursor-pointer hover:bg-gray-50" style={{borderBottom:"1px solid "+C.border}} onClick={()=>{setSelNoteId(String(note['笔记ID']));setTab('单篇诊断');}}>
                          <td className="py-2 px-3 text-xs font-mono" style={{color:C.text}}>{String(note['笔记ID']||'')}</td>
                          <td className="py-2 px-3 text-xs" style={{color:C.text}}>{String(note['笔记简称'])||'-'}</td>
                          <td className="py-2 px-3 text-xs"><a href={String(note['笔记链接']||'#')} target="_blank" rel="noopener noreferrer" style={{color:C.primary}} className="hover:underline" onClick={e=>e.stopPropagation()}>链接</a></td>
                          <td className="py-2 px-3 text-xs" style={{color:C.text}}>{String(note['笔记类型']||'-')}</td>
                          <td className="py-2 px-3"><span className="px-2 py-0.5 rounded-full text-xs" style={{background:note['在投']?'#dcfce7':'#fee2e2',color:note['在投']?'#16a34a':'#dc2626'}}>{note['在投']?'在投':'未在投'}</span></td>
                          <td className="py-2 px-3 text-xs" style={{color:C.pink}}>{fmtY(Number(note['消耗']||0))}</td>
                          <td className="py-2 px-3 text-xs" style={{color:C.blue}}>{fmtY(Number(note['支付金额']||0))}</td>
                          <td className="py-2 px-3 text-xs font-bold" style={{color:roiColor(Number(note['支付ROI']||0))}}>{fmtROI(Number(note['支付ROI']||0))}</td>
                          <td className="py-2 px-3 text-xs" style={{color:C.text}}>{(Number(note['消耗占比']||0)*100).toFixed(1)}%</td>
                          <td className="py-2 px-3 text-xs" style={{color:C.subtext}}>{String(note['投放开始日期']||'-')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {pagedProdLiveNotes.total>0&&(
                    <div className="flex items-center justify-between mt-4">
                      <span className="text-xs" style={{color:C.subtext}}>第{(prodPage-1)*PAGE_SIZE+1}-{Math.min(prodPage*PAGE_SIZE,pagedProdLiveNotes.total)}条，共{pagedProdLiveNotes.total}条</span>
                      <div className="flex gap-2">
                        <button onClick={()=>setProdPage(p=>Math.max(1,p-1))} className="px-3 py-1 text-xs border rounded-lg" style={{borderColor:C.border}} disabled={prodPage===1}>上一页</button>
                        <button onClick={()=>setProdPage(p=>p+1)} className="px-3 py-1 text-xs border rounded-lg" style={{borderColor:C.border}} disabled={prodPage*PAGE_SIZE>=pagedProdLiveNotes.total}>下一页</button>
                      </div>
                    </div>
                  )}
                </Card>
                <Card p={24}>
                  <div className="flex items-center justify-between mb-3">
                    <ST title={`${prodTab} 商销笔记`} sub={`共 ${pagedProdShopNotes.total} 篇`} />
                    <div className="flex rounded-lg overflow-hidden border" style={{borderColor:C.border}}>
                      <button onClick={()=>{setProdShopSortField('消耗');setProdShopSortDir(prodShopSortField==='消耗'&&prodShopSortDir==='desc'?'asc':'desc');setProdShopPage(1);}}
                        className={`px-3 py-1 text-xs ${prodShopSortField==='消耗'?'bg-blue-500 text-white':'bg-white text-gray-700'}`}>
                        消耗{prodShopSortField==='消耗'?(prodShopSortDir==='desc'?' ↓':' ↑'):''}
                      </button>
                      <button onClick={()=>{setProdShopSortField('ROI');setProdShopSortDir(prodShopSortField==='ROI'&&prodShopSortDir==='desc'?'asc':'desc');setProdShopPage(1);}}
                        className={`px-3 py-1 text-xs border-l ${prodShopSortField==='ROI'?'bg-blue-500 text-white':'bg-white text-gray-700'}`} style={{borderColor:C.border}}>
                        ROI{prodShopSortField==='ROI'?(prodShopSortDir==='desc'?' ↓':' ↑'):''}
                      </button>
                    </div>
                  </div>
                  <table className="w-full text-sm">
                    <thead><tr style={{borderBottom:"1px solid "+C.border}}>
                      {['笔记ID','笔记简称','笔记链接','笔记类型','在投状态','消耗','支付金额','支付ROI','消耗占比','投放开始'].map(h=>(
                        <th key={h} className="text-left py-2 px-3 text-xs font-medium" style={{color:C.subtext}}>{h}</th>
                      ))}
                    </tr></thead>
                    <tbody>
                      {pagedProdShopNotes.list.map(note=>(
                        <tr key={String(note['笔记ID'])} className="cursor-pointer hover:bg-gray-50" style={{borderBottom:"1px solid "+C.border}} onClick={()=>{setSelNoteId(String(note['笔记ID']));setTab('单篇诊断');}}>
                          <td className="py-2 px-3 text-xs font-mono" style={{color:C.text}}>{String(note['笔记ID']||'')}</td>
                          <td className="py-2 px-3 text-xs" style={{color:C.text}}>{String(note['笔记简称'])||'-'}</td>
                          <td className="py-2 px-3 text-xs"><a href={String(note['笔记链接']||'#')} target="_blank" rel="noopener noreferrer" style={{color:C.primary}} className="hover:underline" onClick={e=>e.stopPropagation()}>链接</a></td>
                          <td className="py-2 px-3 text-xs" style={{color:C.text}}>{String(note['笔记类型']||'-')}</td>
                          <td className="py-2 px-3"><span className="px-2 py-0.5 rounded-full text-xs" style={{background:note['在投']?'#dcfce7':'#fee2e2',color:note['在投']?'#16a34a':'#dc2626'}}>{note['在投']?'在投':'未在投'}</span></td>
                          <td className="py-2 px-3 text-xs" style={{color:C.pink}}>{fmtY(Number(note['消耗']||0))}</td>
                          <td className="py-2 px-3 text-xs" style={{color:C.blue}}>{fmtY(Number(note['支付金额']||0))}</td>
                          <td className="py-2 px-3 text-xs font-bold" style={{color:roiColor(Number(note['支付ROI']||0))}}>{fmtROI(Number(note['支付ROI']||0))}</td>
                          <td className="py-2 px-3 text-xs" style={{color:C.text}}>{(Number(note['消耗占比']||0)*100).toFixed(1)}%</td>
                          <td className="py-2 px-3 text-xs" style={{color:C.subtext}}>{String(note['投放开始日期']||'-')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {pagedProdShopNotes.total>0&&(
                    <div className="flex items-center justify-between mt-4">
                      <span className="text-xs" style={{color:C.subtext}}>第{(prodShopPage-1)*PAGE_SIZE+1}-{Math.min(prodShopPage*PAGE_SIZE,pagedProdShopNotes.total)}条，共{pagedProdShopNotes.total}条</span>
                      <div className="flex gap-2">
                        <button onClick={()=>setProdShopPage(p=>Math.max(1,p-1))} className="px-3 py-1 text-xs border rounded-lg" style={{borderColor:C.border}} disabled={prodShopPage===1}>上一页</button>
                        <button onClick={()=>setProdShopPage(p=>p+1)} className="px-3 py-1 text-xs border rounded-lg" style={{borderColor:C.border}} disabled={prodShopPage*PAGE_SIZE>=pagedProdShopNotes.total}>下一页</button>
                      </div>
                    </div>
                  )}
                </Card>
              </div>
            )}
          </div>
        )}

        {tab==='笔记总表'&&(
          <div className="space-y-5">
            {noteStandards.length>0&&(
              <Card p={20}>
                <ST title="笔记评级标准" />
                <div className="grid grid-cols-4 gap-3 mt-3">
                  {noteStandards.map(s=>{
                    const colors:Record<string,{bg:string;color:string}>={'爆文笔记':{bg:'#dcfce7',color:'#16a34a'},'跑量笔记':{bg:'#fef3c7',color:'#d97706'},'潜力笔记':{bg:'#dbeafe',color:'#2563eb'},'普通笔记':{bg:'#f3f4f6',color:'#6b7280'}};
                    const c=colors[s.评级]||{bg:'#f3f4f6',color:'#6b7280'};
                    return(
                      <div key={s.评级} className="p-3 rounded-xl" style={{background:c.bg+'60',border:'1px solid '+c.bg}}>
                        <div className="text-sm font-semibold mb-1" style={{color:c.color}}>{s.评级}</div>
                        <div className="text-xs" style={{color:C.subtext}}>消耗{s.消耗条件||'任意'} 且 ROI{s.ROI条件}</div>
                      </div>
                    );
                  })}
                </div>
              </Card>
            )}
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex items-center gap-1">
                <span className="text-xs" style={{color:C.subtext}}>产品:</span>
                <select value={allProductFilter} onChange={e=>{setAllProductFilter(e.target.value);setAllLivePage(1);setAllShopPage(1);}}
                  className="text-xs border rounded-lg px-2 py-1" style={{borderColor:C.border}}>
                  {allNoteProducts.map(p=><option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <input type="text" placeholder="搜索笔记ID" value={allNoteSearchId} onChange={e=>{setAllNoteSearchId(e.target.value);setAllLivePage(1);setAllShopPage(1);}}
                className="text-xs border rounded-lg px-3 py-1.5 w-48 outline-none ml-auto" style={{borderColor:C.border}} />
            </div>
            <Card p={24}>
              <div className="flex items-center justify-between mb-3">
                <ST title="直播笔记列表" sub={`共 ${pagedAllLiveNotes.total} 篇`} />
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="flex items-center gap-1">
                    <span className="text-xs" style={{color:C.subtext}}>评级:</span>
                    <div className="flex rounded-lg overflow-hidden border" style={{borderColor:C.border}}>
                      {['全部',...noteStandards.map(s=>s.评级)].map(r=>(
                        <button key={r} onClick={()=>{setAllLiveRatingFilter(r);setAllLivePage(1);}}
                          className={`px-2 py-1 text-xs ${allLiveRatingFilter===r?'bg-blue-500 text-white':'bg-white text-gray-700'}`} style={{borderLeft:r!=='全部'?'1px solid '+C.border:'none'}}>{r}</button>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-xs" style={{color:C.subtext}}>在投:</span>
                    <div className="flex rounded-lg overflow-hidden border" style={{borderColor:C.border}}>
                      {(['全部','在投','未在投'] as const).map(s=>(
                        <button key={s} onClick={()=>{setAllLiveStatusFilter(s);setAllLivePage(1);}}
                          className={`px-2 py-1 text-xs ${allLiveStatusFilter===s?'bg-blue-500 text-white':'bg-white text-gray-700'}`} style={{borderLeft:s!=='全部'?'1px solid '+C.border:'none'}}>{s}</button>
                      ))}
                    </div>
                  </div>
                  <div className="flex rounded-lg overflow-hidden border" style={{borderColor:C.border}}>
                    <button onClick={()=>{setAllLiveSortField('消耗');setAllLiveSortDir(allLiveSortField==='消耗'&&allLiveSortDir==='desc'?'asc':'desc');setAllLivePage(1);}}
                      className={`px-3 py-1 text-xs ${allLiveSortField==='消耗'?'bg-blue-500 text-white':'bg-white text-gray-700'}`}>
                      消耗{allLiveSortField==='消耗'?(allLiveSortDir==='desc'?' ↓':' ↑'):''}
                    </button>
                    <button onClick={()=>{setAllLiveSortField('ROI');setAllLiveSortDir(allLiveSortField==='ROI'&&allLiveSortDir==='desc'?'asc':'desc');setAllLivePage(1);}}
                      className={`px-3 py-1 text-xs border-l ${allLiveSortField==='ROI'?'bg-blue-500 text-white':'bg-white text-gray-700'}`} style={{borderColor:C.border}}>
                      ROI{allLiveSortField==='ROI'?(allLiveSortDir==='desc'?' ↓':' ↑'):''}
                    </button>
                  </div>
                </div>
              </div>
              <table className="w-full text-sm">
                <thead><tr style={{borderBottom:`1px solid ${C.border}`}}>
                  {['笔记ID','笔记简称','笔记链接','笔记类型','产品','内容方向','笔记评级','在投状态','消耗','支付ROI','投放开始'].map(h=>(
                    <th key={h} className="text-left py-2 px-3 text-xs font-medium" style={{color:C.subtext}}>{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {pagedAllLiveNotes.list.map(note=>{
                    const ratingColors:Record<string,{bg:string;color:string}>={'爆文笔记':{bg:'#dcfce7',color:'#16a34a'},'跑量笔记':{bg:'#fef3c7',color:'#d97706'},'潜力笔记':{bg:'#dbeafe',color:'#2563eb'},'普通笔记':{bg:'#f3f4f6',color:'#6b7280'}};
                    const rc=ratingColors[String(note['评级']||'')]||{bg:'#f3f4f6',color:'#6b7280'};
                    return(
                    <tr key={String(note['笔记ID'])} className="cursor-pointer hover:bg-gray-50" style={{borderBottom:`1px solid ${C.border}`}} onClick={()=>{setSelNoteId(String(note['笔记ID']));setTab('单篇诊断');}}>
                      <td className="py-2 px-3 text-xs font-mono" style={{color:C.text}}>{String(note['笔记ID']||'')}</td>
                      <td className="py-2 px-3 text-xs" style={{color:C.text}}>{String(note['笔记简称'])||'-'}</td>
                      <td className="py-2 px-3 text-xs">{note['笔记链接']?<a href={String(note['笔记链接'])} target="_blank" rel="noopener noreferrer" onClick={e=>e.stopPropagation()} className="hover:underline" style={{color:C.primary}}>打开链接</a>:'-'}</td>
                      <td className="py-2 px-3"><span className="px-2 py-0.5 rounded-full text-xs" style={{background:String(note['笔记类型'])==='视频笔记'?'#FEE2E2':'#DBEAFE',color:String(note['笔记类型'])==='视频笔记'?'#DC2626':'#1D4ED8'}}>{String(note['笔记类型'])||'-'}</span></td>
                      <td className="py-2 px-3 text-xs" style={{color:C.text}}>{String(note['产品'])||'-'}</td>
                      <td className="py-2 px-3 text-xs" style={{color:C.subtext}}>{String(note['内容方向'])||'-'}</td>
                      <td className="py-2 px-3"><span className="px-2 py-0.5 rounded-full text-xs" style={{background:rc.bg,color:rc.color}}>{String(note['评级']||'未分类')}</span></td>
                      <td className="py-2 px-3"><span className="px-2 py-0.5 rounded-full text-xs" style={{background:note['直播在投']?'#dcfce7':'#fee2e2',color:note['直播在投']?'#16a34a':'#dc2626'}}>{note['直播在投']?'在投':'-'}</span></td>
                      <td className="py-2 px-3 text-xs" style={{color:C.pink}}>{fmtY(Number(note['直播消耗'])||0)}</td>
                      <td className="py-2 px-3 text-xs font-bold" style={{color:roiColor(Number(note['直播ROI'])||0)}}>{fmtROI(Number(note['直播ROI'])||0)}</td>
                      <td className="py-2 px-3 text-xs" style={{color:C.subtext}}>{String(note['投放开始日期'])||'-'}</td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
              {pagedAllLiveNotes.total>0&&(
                <div className="flex items-center justify-between mt-4">
                  <span className="text-xs" style={{color:C.subtext}}>第{(allLivePage-1)*PAGE_SIZE+1}-{Math.min(allLivePage*PAGE_SIZE,pagedAllLiveNotes.total)}条，共{pagedAllLiveNotes.total}条</span>
                  <div className="flex gap-2">
                    <button onClick={()=>setAllLivePage(p=>Math.max(1,p-1))} className="px-3 py-1 text-xs border rounded-lg" style={{borderColor:C.border}} disabled={allLivePage===1}>上一页</button>
                    <button onClick={()=>setAllLivePage(p=>p+1)} className="px-3 py-1 text-xs border rounded-lg" style={{borderColor:C.border}} disabled={allLivePage*PAGE_SIZE>=pagedAllLiveNotes.total}>下一页</button>
                  </div>
                </div>
              )}
            </Card>
            <Card p={24}>
              <div className="flex items-center justify-between mb-3">
                <ST title="商销笔记列表" sub={`共 ${pagedAllShopNotes.total} 篇`} />
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="flex items-center gap-1">
                    <span className="text-xs" style={{color:C.subtext}}>评级:</span>
                    <div className="flex rounded-lg overflow-hidden border" style={{borderColor:C.border}}>
                      {['全部',...noteStandards.map(s=>s.评级)].map(r=>(
                        <button key={r} onClick={()=>{setAllShopRatingFilter(r);setAllShopPage(1);}}
                          className={`px-2 py-1 text-xs ${allShopRatingFilter===r?'bg-blue-500 text-white':'bg-white text-gray-700'}`} style={{borderLeft:r!=='全部'?'1px solid '+C.border:'none'}}>{r}</button>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-xs" style={{color:C.subtext}}>在投:</span>
                    <div className="flex rounded-lg overflow-hidden border" style={{borderColor:C.border}}>
                      {(['全部','在投','未在投'] as const).map(s=>(
                        <button key={s} onClick={()=>{setAllShopStatusFilter(s);setAllShopPage(1);}}
                          className={`px-2 py-1 text-xs ${allShopStatusFilter===s?'bg-blue-500 text-white':'bg-white text-gray-700'}`} style={{borderLeft:s!=='全部'?'1px solid '+C.border:'none'}}>{s}</button>
                      ))}
                    </div>
                  </div>
                  <div className="flex rounded-lg overflow-hidden border" style={{borderColor:C.border}}>
                    <button onClick={()=>{setAllShopSortField('消耗');setAllShopSortDir(allShopSortField==='消耗'&&allShopSortDir==='desc'?'asc':'desc');setAllShopPage(1);}}
                      className={`px-3 py-1 text-xs ${allShopSortField==='消耗'?'bg-blue-500 text-white':'bg-white text-gray-700'}`}>
                      消耗{allShopSortField==='消耗'?(allShopSortDir==='desc'?' ↓':' ↑'):''}
                    </button>
                    <button onClick={()=>{setAllShopSortField('ROI');setAllShopSortDir(allShopSortField==='ROI'&&allShopSortDir==='desc'?'asc':'desc');setAllShopPage(1);}}
                      className={`px-3 py-1 text-xs border-l ${allShopSortField==='ROI'?'bg-blue-500 text-white':'bg-white text-gray-700'}`} style={{borderColor:C.border}}>
                      ROI{allShopSortField==='ROI'?(allShopSortDir==='desc'?' ↓':' ↑'):''}
                    </button>
                  </div>
                </div>
              </div>
              <table className="w-full text-sm">
                <thead><tr style={{borderBottom:`1px solid ${C.border}`}}>
                  {['笔记ID','笔记简称','笔记链接','笔记类型','产品','内容方向','笔记评级','在投状态','消耗','支付ROI','投放开始'].map(h=>(
                    <th key={h} className="text-left py-2 px-3 text-xs font-medium" style={{color:C.subtext}}>{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {pagedAllShopNotes.list.map(note=>{
                    const ratingColors:Record<string,{bg:string;color:string}>={'爆文笔记':{bg:'#dcfce7',color:'#16a34a'},'跑量笔记':{bg:'#fef3c7',color:'#d97706'},'潜力笔记':{bg:'#dbeafe',color:'#2563eb'},'普通笔记':{bg:'#f3f4f6',color:'#6b7280'}};
                    const rc=ratingColors[String(note['评级']||'')]||{bg:'#f3f4f6',color:'#6b7280'};
                    return(
                    <tr key={String(note['笔记ID'])} className="cursor-pointer hover:bg-gray-50" style={{borderBottom:`1px solid ${C.border}`}} onClick={()=>{setSelNoteId(String(note['笔记ID']));setTab('单篇诊断');}}>
                      <td className="py-2 px-3 text-xs font-mono" style={{color:C.text}}>{String(note['笔记ID']||'')}</td>
                      <td className="py-2 px-3 text-xs" style={{color:C.text}}>{String(note['笔记简称'])||'-'}</td>
                      <td className="py-2 px-3 text-xs">{note['笔记链接']?<a href={String(note['笔记链接'])} target="_blank" rel="noopener noreferrer" onClick={e=>e.stopPropagation()} className="hover:underline" style={{color:C.primary}}>打开链接</a>:'-'}</td>
                      <td className="py-2 px-3"><span className="px-2 py-0.5 rounded-full text-xs" style={{background:String(note['笔记类型'])==='视频笔记'?'#FEE2E2':'#DBEAFE',color:String(note['笔记类型'])==='视频笔记'?'#DC2626':'#1D4ED8'}}>{String(note['笔记类型'])||'-'}</span></td>
                      <td className="py-2 px-3 text-xs" style={{color:C.text}}>{String(note['产品'])||'-'}</td>
                      <td className="py-2 px-3 text-xs" style={{color:C.subtext}}>{String(note['内容方向'])||'-'}</td>
                      <td className="py-2 px-3"><span className="px-2 py-0.5 rounded-full text-xs" style={{background:rc.bg,color:rc.color}}>{String(note['评级']||'未分类')}</span></td>
                      <td className="py-2 px-3"><span className="px-2 py-0.5 rounded-full text-xs" style={{background:note['商笔在投']?'#dcfce7':'#fee2e2',color:note['商笔在投']?'#16a34a':'#dc2626'}}>{note['商笔在投']?'在投':'-'}</span></td>
                      <td className="py-2 px-3 text-xs" style={{color:C.pink}}>{fmtY(Number(note['商销消耗'])||0)}</td>
                      <td className="py-2 px-3 text-xs font-bold" style={{color:roiColor(Number(note['商销ROI'])||0)}}>{fmtROI(Number(note['商销ROI'])||0)}</td>
                      <td className="py-2 px-3 text-xs" style={{color:C.subtext}}>{String(note['投放开始日期'])||'-'}</td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
              {pagedAllShopNotes.total>0&&(
                <div className="flex items-center justify-between mt-4">
                  <span className="text-xs" style={{color:C.subtext}}>第{(allShopPage-1)*PAGE_SIZE+1}-{Math.min(allShopPage*PAGE_SIZE,pagedAllShopNotes.total)}条，共{pagedAllShopNotes.total}条</span>
                  <div className="flex gap-2">
                    <button onClick={()=>setAllShopPage(p=>Math.max(1,p-1))} className="px-3 py-1 text-xs border rounded-lg" style={{borderColor:C.border}} disabled={allShopPage===1}>上一页</button>
                    <button onClick={()=>setAllShopPage(p=>p+1)} className="px-3 py-1 text-xs border rounded-lg" style={{borderColor:C.border}} disabled={allShopPage*PAGE_SIZE>=pagedAllShopNotes.total}>下一页</button>
                  </div>
                </div>
              )}
            </Card>
          </div>
        )}

      </div>
    </div>
  );
}

// ── Sub-components (avoid complex JSX in main render) ──

function DoughnutSceneShare({data}:{data:Record<string,number>}) {
  const keys = Object.keys(data);
  if (keys.length === 0) return <div className="flex items-center justify-center h-full text-sm" style={{color:C.subtext}}>暂无数据</div>;
  const total = Object.values(data).reduce((a,b)=>a+b,0);
  const colors = [C.pink, C.blue, C.orange, C.purple];
  return (
    <div className="relative w-full h-full flex items-center justify-center">
      <Doughnut
        data={{labels:keys,datasets:[{data:Object.values(data).map(v=>Number(v)),backgroundColor:colors.slice(0,keys.length),borderWidth:0,hoverOffset:6}]}}
        options={{
          responsive:true,maintainAspectRatio:false,
          plugins:{
            legend:{display:false},
            datalabels:{display:false},
            tooltip:{
              callbacks:{
                label: ctx=>` ${ctx.label}: ¥${ctx.parsed.toLocaleString('zh-CN')} (${(ctx.parsed/total*100).toFixed(1)}%)`,
              }
            },
          },
          cutout:'65%',
        }}
      />
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none" style={{width:'45%'}}>
        <div className="text-center">
          <div className="text-xs" style={{color:C.subtext}}>总消耗</div>
          <div className="text-base font-bold" style={{color:C.text}}>{total>=1e4?'¥'+(total/1e4).toFixed(1)+'万':total>=1e4?'¥'+(total/1e4).toFixed(1)+'万':'¥'+total.toLocaleString('zh-CN')}</div>
        </div>
      </div>
      {keys.map((key,i)=>(
        <div key={key} className="absolute flex items-center gap-1.5 text-xs" style={{right:8,top:`${16+i*22}%`,color:C.text}}>
          <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{background:colors[i]}} />
          <span>{key}</span>
          <span className="font-semibold">{Object.values(data)[i]>=1e4?(Object.values(data)[i]/1e4).toFixed(1)+'万':Object.values(data)[i].toLocaleString('zh-CN')}</span>
          <span style={{color:C.subtext}}>({(Object.values(data)[i]/total*100).toFixed(0)}%)</span>
        </div>
      ))}
    </div>
  );
}

function NoteTable({notes,onRowClick,sortField,sortDir,onSort}:{notes:RawRecord[];onRowClick:(id:string)=>void;sortField?:'消耗'|'ROI';sortDir?:'asc'|'desc';onSort?:(f:'消耗'|'ROI')=>void}) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr style={{borderBottom:`1px solid ${C.border}`}}>
          {['笔记ID','笔记简称','笔记链接','笔记类型','产品','内容方向','直播在投','商销在投','消耗','支付ROI','投放开始'].map(h=>{
            if(h==='消耗')return <th key={h} className="text-left py-2 px-3 text-xs font-medium cursor-pointer select-none" style={{color:C.subtext}} onClick={()=>onSort?.('消耗')}>{h} {sortField==='消耗'?(sortDir==='desc'?'↓':'↑'):''}</th>;
            if(h==='支付ROI')return <th key={h} className="text-left py-2 px-3 text-xs font-medium cursor-pointer select-none" style={{color:C.subtext}} onClick={()=>onSort?.('ROI')}>{h} {sortField==='ROI'?(sortDir==='desc'?'↓':'↑'):''}</th>;
            return <th key={h} className="text-left py-2 px-3 text-xs font-medium" style={{color:C.subtext}}>{h}</th>;
          })}
        </tr>
      </thead>
      <tbody>
        {notes.map(note=>{
          const isVid = String(note['笔记类型'])==='视频笔记';
          return (
            <tr key={String(note['笔记ID'])} className="cursor-pointer hover:bg-gray-50" style={{borderBottom:`1px solid ${C.border}`}}
              onClick={()=>onRowClick(String(note['笔记ID']))}>
              <td className="py-2 px-3 font-mono text-xs" style={{color:C.primary}}>
                <span className="cursor-pointer hover:underline">{String(note['笔记ID'])}</span>
              </td>
              <td className="py-2 px-3 text-xs" style={{color:C.text}}>{String(note['笔记简称'])||'-'}</td>
              <td className="py-2 px-3 text-xs" style={{color:C.subtext}}>
                {note['笔记链接']
                  ? <a href={String(note['笔记链接'])} target="_blank" rel="noopener noreferrer" onClick={e=>e.stopPropagation()} className="hover:underline" style={{color:C.primary}}>打开链接</a>
                  : '-'}
              </td>
              <td className="py-2 px-3">
                <span className="px-2 py-0.5 rounded-full text-xs" style={{background:isVid?'#FEE2E2':'#DBEAFE',color:isVid?'#DC2626':'#1D4ED8'}}>{String(note['笔记类型'])||'-'}</span>
              </td>
              <td className="py-2 px-3 text-xs" style={{color:C.text}}>{String(note['产品'])||'-'}</td>
              <td className="py-2 px-3 text-xs" style={{color:C.subtext}}>{String(note['内容方向'])||'-'}</td>
              <td className="py-2 px-3">
                <span className="px-2 py-0.5 rounded-full text-xs" style={{background:note['直播在投']?'#dcfce7':'#fee2e2',color:note['直播在投']?'#16a34a':'#dc2626'}}>{note['直播在投']?'在投':'-'}</span>
              </td>
              <td className="py-2 px-3">
                <span className="px-2 py-0.5 rounded-full text-xs" style={{background:note['商笔在投']?'#dcfce7':'#fee2e2',color:note['商笔在投']?'#16a34a':'#dc2626'}}>{note['商笔在投']?'在投':'-'}</span>
              </td>
              <td className="py-2 px-3 text-xs" style={{color:C.pink}}>{fmtY(Number(note['消耗'])||0)}</td>
              <td className="py-2 px-3 text-xs font-bold" style={{color:roiColor(Number(note['ROI'])||0)}}>{fmtROI(Number(note['ROI'])||0)}</td>
              <td className="py-2 px-3 text-xs" style={{color:C.subtext}}>{String(note['投放开始日期'])||'-'}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function NoteTableFull({notes,onRowClick}:{notes:RawRecord[];onRowClick:(id:string)=>void}) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr style={{borderBottom:`1px solid ${C.border}`}}>
          {['笔记ID','笔记简称','笔记链接','笔记类型','产品','内容方向','直播在投','商销在投','消耗','支付ROI','投放开始'].map(h=>(
            <th key={h} className="text-left py-2 px-3 text-xs font-medium" style={{color:C.subtext}}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {notes.map(note=>{
          const isVid = String(note['笔记类型'])==='视频笔记';
          return (
            <tr key={String(note['笔记ID'])} className="cursor-pointer hover:bg-gray-50" style={{borderBottom:`1px solid ${C.border}`}}
              onClick={()=>onRowClick(String(note['笔记ID']))}>
              <td className="py-2 px-3 font-mono text-xs" style={{color:C.primary}}>
                <span className="cursor-pointer hover:underline">{String(note['笔记ID'])}</span>
              </td>
              <td className="py-2 px-3 text-xs" style={{color:C.text}}>{String(note['笔记简称'])||'-'}</td>
              <td className="py-2 px-3 text-xs" style={{color:C.subtext}}>
                {note['笔记链接']
                  ? <a href={String(note['笔记链接'])} target="_blank" rel="noopener noreferrer" onClick={e=>e.stopPropagation()} className="hover:underline" style={{color:C.primary}}>打开链接</a>
                  : '-'}
              </td>
              <td className="py-2 px-3">
                <span className="px-2 py-0.5 rounded-full text-xs" style={{background:isVid?'#FEE2E2':'#DBEAFE',color:isVid?'#DC2626':'#1D4ED8'}}>{String(note['笔记类型'])||'-'}</span>
              </td>
              <td className="py-2 px-3 text-xs" style={{color:C.text}}>{String(note['产品'])||'-'}</td>
              <td className="py-2 px-3 text-xs" style={{color:C.subtext}}>{String(note['内容方向'])||'-'}</td>
              <td className="py-2 px-3">
                <span className="px-2 py-0.5 rounded-full text-xs" style={{background:note['直播在投']?'#dcfce7':'#fee2e2',color:note['直播在投']?'#16a34a':'#dc2626'}}>{note['直播在投']?'在投':'-'}</span>
              </td>
              <td className="py-2 px-3">
                <span className="px-2 py-0.5 rounded-full text-xs" style={{background:note['商笔在投']?'#dcfce7':'#fee2e2',color:note['商笔在投']?'#16a34a':'#dc2626'}}>{note['商笔在投']?'在投':'-'}</span>
              </td>
              <td className="py-2 px-3 text-xs" style={{color:C.pink}}>{fmtY(Number(note['消耗'])||0)}</td>
              <td className="py-2 px-3 text-xs font-bold" style={{color:roiColor(Number(note['ROI'])||0)}}>{fmtROI(Number(note['ROI'])||0)}</td>
              <td className="py-2 px-3 text-xs" style={{color:C.subtext}}>{String(note['投放开始日期'])||'-'}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
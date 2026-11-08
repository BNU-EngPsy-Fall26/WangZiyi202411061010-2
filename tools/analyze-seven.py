"""Recompute all seven participants from the archived, private course-platform snapshot.
Run from project root: python tools/analyze-seven.py
Requires numpy, scipy, matplotlib. No cloud writes.
"""
from pathlib import Path
import json, itertools, math
import numpy as np
from scipy import stats
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.font_manager import FontProperties
ROOT=Path(__file__).resolve().parents[1]
D=json.loads((ROOT/"data.private/analysis-seven-input.json").read_text(encoding="utf-8"))
APP=json.loads((ROOT/"data.private/analysis-seven-app.json").read_text(encoding="utf-8"))
OUT=ROOT/"results";OUT.mkdir(exist_ok=True)
ids=[f"P{i:02d}" for i in range(1,8)]
mean=lambda x:float(np.mean(x)) if len(x) else None
valid=lambda x:[v for v in x if v is not None and math.isfinite(v)]
def summarize(ts,exp):
 rt=[t["rt"] for t in ts if t["rt"] is not None and 150<=t["rt"]<={"search":4500,"ratio":12000,"map":5000}[exp] and (exp=="ratio" or t["correct"]==1)]
 es=[t["estimate"]-t["truth"] for t in ts if not t["timeout"] and t.get("estimate") is not None]
 return dict(n=len(ts),rtN=len(rt),rt=float(np.median(rt)) if rt else None,acc=mean([t["correct"] for t in ts]) if exp!="ratio" else None,err=mean([abs(e) for e in es]) if exp=="ratio" else None,bias=mean(es) if exp=="ratio" else None,timeout=sum(t["timeout"] for t in ts),exposure=mean([t["exposure_ms"] for t in ts]) if exp=="ratio" else None)
def contrast(xs):
 a=np.array(valid(xs));n=len(a);mu=float(a.mean());sd=float(a.std(ddof=1));se=sd/math.sqrt(n)
 ci=stats.t.interval(.95,n-1,loc=mu,scale=se) if se else (mu,mu)
 tt=stats.ttest_1samp(a,0) if se else None
 signs=np.array(list(itertools.product([-1,1],repeat=n)))
 exact=float(np.mean(np.abs((signs*a).mean(axis=1))>=abs(mu)-1e-10))
 return dict(n=n,mean=mu,median=float(np.median(a)),sd=sd,ci95=list(map(float,ci)),t=float(tt.statistic) if tt else None,p=float(tt.pvalue) if tt else None,p_signflip=exact,dz=mu/sd if sd else None,positive=int(sum(a>0)),negative=int(sum(a<0)))
def sub(a,b):return a-b if a is not None and b is not None else None
def avgdiff(pairs):
 ds=[sub(x,y) for x,y in pairs]
 return mean(ds) if all(v is not None for v in ds) else None
G={};R={}
for app in APP:
 exp=app["exp"];people={};raw={r["participant"]:r for r in D["records"] if r["experiment"]==exp}
 assert set(raw)==set(ids)
 for pid in ids:
  ts=raw[pid]["trials"];assert len(ts)=={"search":160,"ratio":60,"map":120}[exp]
  cells={}
  for c in app["cells"]:
   key=c["key"];ct=[t for t in ts if t["cond"]==key];assert len(ct)==10
   cells[key]=summarize(ct,exp)
  ef={};v=lambda k,m="rt":cells[k][m]
  if exp=="search":
   for state in ["present","absent"]:
    sl=lambda l:sub(v(f"{l}_0_24_{state}"),v(f"{l}_0_8_{state}"))/16
    ef["classic_"+state]=sl("mixed")-sl("feature")
   for l,n in itertools.product(["feature","mixed"],[8,24]):
    ef[f"cost_{l}_{n}"]=avgdiff([(v(f"{l}_1_{n}_{s}"),v(f"{l}_0_{n}_{s}")) for s in ["present","absent"]])
   ef["load_search"]=avgdiff([(ef[f"cost_mixed_{n}"],ef[f"cost_feature_{n}"]) for n in [8,24]])
   ef["load_size"]=avgdiff([(ef[f"cost_{l}_24"],ef[f"cost_{l}_8"]) for l in ["feature","mixed"]])
  elif exp=="ratio":
   for e in ["angle","area"]:ef["classic_"+e]=v(e+"_1500","err")-v("position_1500","err")
   for e in ["position","angle","area"]:ef["duration_"+e]=v(e+"_300","err")-v(e+"_1500","err")
   for e in ["angle","area"]:ef["interaction_"+e]=ef["duration_"+e]-ef["duration_position"]
  else:
   for task in ["ego","geo"]:
    pairs=lambda x,y:[(v(f"{x}_{task}_{a}"),v(f"{y}_{task}_{a}")) for a in [30,120]]
    ef["orientation_"+task]=avgdiff(pairs("north","track"))
    ef["dual_gain_"+task]=avgdiff(pairs("north" if task=="ego" else "track","dual"))
    ef["dual_"+task]=avgdiff(pairs("track" if task=="ego" else "north","dual"))
   ef["interaction"]=sub(ef["orientation_ego"],ef["orientation_geo"])
  ap=next(p["metrics"] for p in app["people"] if p["id"]==pid)
  for c in ap["cells"]:
   for m in ["rt","acc","err","bias","exposure"]:
    x,y=c[m],cells[c["key"]][m]
    assert x is None and y is None or x is not None and y is not None and abs(x-y)<1e-8,(exp,pid,c["key"],m,x,y)
  for e in ap["effects"]:
   x,y=e["value"],ef[e["key"]]
   assert x is None and y is None or x is not None and y is not None and abs(x-y)<1e-8,(pid,e,x,y)
  eye=[t for t in ts if t.get("gaze_n",0)>0]
  assert all(sum(t.get("gaze_aoi",[]))==t.get("gaze_n",0) for t in eye)
  people[pid]=dict(cells=cells,effects=ef,overall=summarize(ts,exp),eye=dict(trials=len(eye),samples=sum(t["gaze_n"] for t in eye),calibration=sorted(set(t["gaze_calibration"] for t in eye))))
 effects={e["key"]:dict(label=e["label"],unit=e["unit"],points={pid:people[pid]["effects"][e["key"]] for pid in ids},**contrast([people[pid]["effects"][e["key"]] for pid in ids])) for e in app["effects"]}
 order=sorted(effects,key=lambda k:effects[k]["p"]);running=0
 for rank,key in enumerate(order):
  running=max(running,(len(order)-rank)*effects[key]["p"]);effects[key]["p_holm"]=min(1.,running)
 groupcells={c["key"]:dict(label=c["label"],**{m:mean(valid([people[pid]["cells"][c["key"]][m] for pid in ids])) for m in ["rt","acc","err","bias","exposure"]},rtPeople=sum(people[pid]["cells"][c["key"]]["rt"] is not None for pid in ids)) for c in app["cells"]}
 G[exp]=dict(people=people,cells=groupcells,effects=effects,total=sum(len(r["trials"]) for r in raw.values()),timeouts=sum(p["overall"]["timeout"] for p in people.values()))
print("INDEPENDENT VERIFICATION PASSED: all person/cell metrics and effects match application.")
(OUT/"statistics-seven.json").write_text(json.dumps(dict(fetchedAt=D["fetchedAt"],sources=D["sources"],participants=ids,experiments=G),ensure_ascii=False,indent=2),encoding="utf-8")
for exp,g in G.items():
 print("\n",exp,"trials",g["total"],"timeouts",g["timeouts"])
 for key,e in g["effects"].items():print(key, json.dumps({k:e[k] for k in ["n","mean","median","ci95","p","p_holm","p_signflip","positive","negative"]}))
print("MAP ZERO CORRECT",[(pid,key) for pid,p in G["map"]["people"].items() for key,c in p["cells"].items() if c["rt"] is None])
# Publication-style figures: all marks are participant-level observations.
from matplotlib.lines import Line2D
from matplotlib.ticker import MultipleLocator
from matplotlib import font_manager
font_manager.fontManager.addfont("C:/Windows/Fonts/simsun.ttc")
font_manager.fontManager.addfont("C:/Windows/Fonts/times.ttf")
plt.rcParams.update({
 "font.family":["Times New Roman","SimSun"],"axes.unicode_minus":False,
 "font.size":10,"axes.labelsize":10,"axes.titlesize":10,"legend.fontsize":9,
 "xtick.labelsize":9,"ytick.labelsize":9,"axes.linewidth":.7,
 "axes.spines.top":False,"axes.spines.right":False,
 "xtick.direction":"out","ytick.direction":"out","xtick.major.width":.7,"ytick.major.width":.7,
 "figure.facecolor":"white","axes.facecolor":"white","savefig.facecolor":"white",
 "savefig.dpi":320,"svg.fonttype":"none"})
BLUE="#315B7C";GOLD="#B07132";GREY="#B9BEC3";DARK="#343B41"
PERSON_COLOR="#A6ADB4"
def decorate(ax,title,ylabel=None):
 ax.set_title(title,loc="left",pad=12,fontweight="normal")
 if ylabel:ax.set_ylabel(ylabel,labelpad=7)
 ax.tick_params(length=3.5,pad=4);ax.set_axisbelow(True)
 ax.grid(axis="y",color="#E4E7EA",linewidth=.45)
 for spine in ["left","bottom"]:ax.spines[spine].set_color("#4B5055")
def interval(values):
 a=np.asarray(values,dtype=float);mu=float(a.mean());half=stats.t.ppf(.975,len(a)-1)*stats.sem(a)
 return mu,float(half)
def dot_interval(ax,x,values,color=BLUE,marker="o",label=None,connect=True,individual=True):
 values=np.asarray(values,dtype=float)
 if individual:
  for row in values:
   if connect:ax.plot(x,row,color=GREY,lw=.65,alpha=.8,zorder=1)
   ax.scatter(x,row,s=13,color=PERSON_COLOR,edgecolor="white",linewidth=.35,zorder=2)
 means=[];halves=[]
 for j in range(values.shape[1]):
  m,h=interval(values[:,j]);means.append(m);halves.append(h)
 ax.errorbar(x,means,yerr=halves,color=color,fmt=marker,ms=5.4,
  lw=1.2,elinewidth=.95,capsize=3,capthick=.95,
  markerfacecolor="white",markeredgewidth=1.2,label=label,zorder=5)
 return means
# Figure 1: classic search and added singleton-distractor conditions.
fig,axs=plt.subplots(2,2,figsize=(7.5,6.2))
fig.subplots_adjust(left=.105,right=.98,bottom=.095,top=.90,hspace=.64,wspace=.28)
for ax,state,letter,title in zip(axs[0],["present","absent"],["a","b"],["目标存在","目标缺失"]):
 for layout,label,col,mark in [("feature","特征搜索",BLUE,"o"),("mixed","联合搜索",GOLD,"s")]:
  vals=np.array([[G["search"]["people"][pid]["cells"][f"{layout}_0_{n}_{state}"]["rt"] for n in [8,24]] for pid in ids])
  means=[];halves=[]
  for a in vals.T:m,h=interval(a);means.append(m);halves.append(h)
  ax.errorbar([8,24],means,yerr=halves,fmt=mark+"-",ms=5.4,color=col,lw=1.2,
   elinewidth=.95,capsize=3,markerfacecolor="white",markeredgewidth=1.2,label=label)
 ax.set(xlim=(5,27),ylim=(0,1750),xticks=[8,24],xlabel="集合大小（项）")
 ax.yaxis.set_major_locator(MultipleLocator(500))
 decorate(ax,f"({letter}) {title}","正确反应时（ms）")
for ax,layout,letter,title,col in zip(axs[1],["feature","mixed"],["c","d"],["特征搜索的干扰代价","联合搜索的干扰代价"],[BLUE,GOLD]):
 vals=np.array([[G["search"]["people"][pid]["effects"][f"cost_{layout}_{n}"] for n in [8,24]] for pid in ids])
 dot_interval(ax,[0,1],vals,col,marker="o" if layout=="feature" else "s")
 ax.axhline(0,color="#686F75",lw=.8,ls=(0,(3,3)),zorder=0)
 ax.set(xlim=(-.3,1.3),ylim=(-210,230),xticks=[0,1],xticklabels=["8","24"],xlabel="集合大小（项）")
 ax.yaxis.set_major_locator(MultipleLocator(100))
 decorate(ax,f"({letter}) {title}","反应时差（ms）")
fig.legend(*axs[0,0].get_legend_handles_labels(),loc="upper center",bbox_to_anchor=(.54,.985),ncol=2,frameon=False,columnspacing=3,handlelength=2.8)
fig.savefig(OUT/"search.png");plt.close(fig)
# Figure 2: absolute errors and within-participant exposure-duration effects.
fig,axs=plt.subplots(1,2,figsize=(7.5,3.55))
fig.subplots_adjust(left=.095,right=.98,bottom=.17,top=.80,wspace=.33)
xs=np.arange(3)
for j,(duration,col,mark) in enumerate([(300,BLUE,"o"),(1500,GOLD,"s")]):
 vals=np.array([[G["ratio"]["people"][pid]["cells"][f"{e}_{duration}"]["err"] for e in ["position","angle","area"]] for pid in ids])
 dot_interval(axs[0],xs+(j-.5)*.16,vals,col,mark,f"{duration} ms",connect=False,individual=False)
axs[0].set(xticks=xs,xticklabels=["共同基线","扇形角度","圆形面积"],xlim=(-.45,2.45),ylim=(0,22))
axs[0].yaxis.set_major_locator(MultipleLocator(5));decorate(axs[0],"(a) 不同编码的比例估计误差","平均绝对误差（百分点）")
vals=np.array([[G["ratio"]["people"][pid]["effects"]["duration_"+e] for e in ["position","angle","area"]] for pid in ids])
dot_interval(axs[1],xs,vals,BLUE,connect=False)
axs[1].axhline(0,color="#686F75",lw=.8,ls=(0,(3,3)))
axs[1].set(xticks=xs,xticklabels=["共同基线","扇形角度","圆形面积"],xlim=(-.45,2.45),ylim=(-24,22))
axs[1].yaxis.set_major_locator(MultipleLocator(10));decorate(axs[1],"(b) 观看时间缩短的误差增量","误差差值（百分点）")
fig.legend(*axs[0].get_legend_handles_labels(),loc="upper center",bbox_to_anchor=(.53,.985),ncol=2,frameon=False,columnspacing=3,handlelength=2)
fig.savefig(OUT/"ratio.png");plt.close(fig)
# Figure 3: accuracy uses all seven; geographic RT uses matched complete cases.
fig,axs=plt.subplots(2,2,figsize=(7.5,6.25))
fig.subplots_adjust(left=.10,right=.98,bottom=.095,top=.90,hspace=.60,wspace=.28)
displays=["north","track","dual"];labels=["北向上","航向上","双地图"]
for ax,task,letter,title in zip(axs[0],["ego","geo"],["a","b"],["左右判断：正确率","东西判断：正确率"]):
 vals=np.array([[mean([G["map"]["people"][pid]["cells"][f"{d}_{task}_{a}"]["acc"] for a in [30,120]])*100 for d in displays] for pid in ids])
 for row in vals:
  ax.plot(xs,row,color=GREY,lw=.65,zorder=1)
  ax.scatter(xs,row,s=13,color=PERSON_COLOR,edgecolor="white",linewidth=.35,zorder=2)
 ax.plot(xs,vals.mean(axis=0),"s-",color=BLUE,ms=5.4,markerfacecolor="white",markeredgewidth=1.2,lw=1.2,zorder=4)
 ax.set(xticks=xs,xticklabels=labels,xlim=(-.3,2.3),ylim=(0,105))
 ax.yaxis.set_major_locator(MultipleLocator(25));decorate(ax,f"({letter}) {title}","正确率（%）")
matched=[pid for pid in ids if G["map"]["people"][pid]["effects"]["orientation_geo"] is not None]
for ax,task,pids,letter,title in [(axs[1,0],"ego",ids,"c","左右判断：反应时"),(axs[1,1],"geo",matched,"d","东西判断：反应时")]:
 vals=np.array([[mean([G["map"]["people"][pid]["cells"][f"{d}_{task}_{a}"]["rt"] for a in [30,120]]) for d in displays] for pid in pids])
 for pid,row in zip(pids,vals):
  ax.plot(xs,row,color=GREY,lw=.65,zorder=1)
  ax.scatter(xs,row,s=13,color=PERSON_COLOR,edgecolor="white",linewidth=.35,zorder=2)
 means=vals.mean(axis=0)
 ax.plot(xs,means,"s-",color=BLUE,ms=5.4,markerfacecolor="white",markeredgewidth=1.2,lw=1.2,zorder=4)
 ax.set(xticks=xs,xticklabels=labels,xlim=(-.3,2.3),ylim=(0,3400))
 ax.yaxis.set_major_locator(MultipleLocator(1000));decorate(ax,f"({letter}) {title}（n = {len(pids)}）","正确反应时（ms）")
 if task=="ego":
  y=vals[ids.index("P07"),1];ax.annotate("P07",xy=(1,y),xytext=(1.17,y+60),fontsize=8,color=DARK)
handles=[Line2D([0],[0],color=PERSON_COLOR,marker="o",ms=3,lw=.65,label="参与者"),Line2D([0],[0],color=BLUE,marker="s",markerfacecolor="white",ms=5.4,lw=1.2,label="组均值")]
fig.legend(handles=handles,loc="upper center",bbox_to_anchor=(.54,.985),ncol=2,frameon=False,columnspacing=3)
fig.savefig(OUT/"map.png");plt.close(fig)

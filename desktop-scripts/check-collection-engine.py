"""State-machine simulation: no native library, no game, no UAC."""
import json
import os
import re
import sys
import tempfile
from types import SimpleNamespace
from unittest.mock import patch
from pathlib import Path
sys.dont_write_bytecode=True
project=Path(__file__).resolve().parents[1];sys.path.insert(0,str(project/'automation/maanikke'))
import collection_worker as engine
roster={c['nameCn']:c for c in json.loads((project/'src/data/roster.json').read_text('utf-8'))['characters']}
class Job:
    succeeded=True
    def wait(self):return self
class FakeService:
    capture_backend=SimpleNamespace(inspect=lambda:{'size':engine.LAYOUT_SIZE})
    card_destination='detail'
    after_wallpaper='detail'
    def __init__(self,_):self.page='hall';self.query='';self.expanded=False;self.controller=self;self.last=None;self.connection=None;self.selected='';self.slot=0;self.inputs=[]
    def initialize(self):pass
    def windows(self):return {'windows':[{'hwnd':'123','pid':123,'elevated':True}]}
    def connect(self,_):self.connection=self.windows()['windows'][0]
    def close(self):pass
    def post_input_text(self,text):self.query=text;self.inputs.append(('text',text));return Job()
    def post_click(self,x,y):
        self.inputs.append(('click',x,y))
        if self.page in ('paid_shop','department_store','outpost','ark','unknown'):
            assert 149<=x<182 and 1004<=y<1034
            self.page='hall'
        elif self.page=='hall':assert 675<x<820 and y>945;self.page='list'
        elif self.page=='list':
            if y>940:self.page='hall'
            elif y<270:self.expanded=True
            elif x>1080 and x<1110 and y<350:self.query=''
            elif y>370:self.page=self.card_destination;self.selected=self.query
        elif self.page=='detail_wallpaper_hidden':
            assert any(left<=x<left+w and top<=y<top+h for left,top,w,h in engine.COLLECTIBLE_TOGGLE_BOXES)
            self.page=self.after_wallpaper
        elif self.page=='detail':
            if x<140 and y>990:self.page='list'
            elif x>1600:self.slot=1 if x>1740 and y<830 else 2 if x<1740 else 3;self.page='non_overload' if self.slot==1 else 'overload'
        else:assert (x>1150 and y<115) or (1260<=x<=1470 and 250<=y<=750);self.page='detail'
        return Job()
class FakePages:
    image=None
    def __init__(self,s):self.s=s
    def reset(self):pass
    def page(self):return self.s.page
    def is_page(self,expected):return self.s.page==expected
    def home_button(self):return [149,1004,33,30] if self.s.page in ('paid_shop','department_store','outpost','ark','unknown') else None
    def home_button_with_back(self):return self.home_button() if self.s.page=='unknown' else None
    def detail_matches(self,c):raise AssertionError('Fast flow must not re-identify inside details')
    def equipment_tab(self):return True
    def slot_state(self,index):return 'unequipped' if index==0 else 'equipped'
    def match(self,name,roi,threshold=.83):
        hit=name=='close' and self.s.page in ('overload','non_overload') or name=='clear' and bool(self.s.query) or name=='search' and not self.s.expanded
        box=[1159,78,30,30] if name=='close' else [1084,304,20,20] if name=='clear' else [672,193,63,53]
        return {'hit':hit,'box':box}
    def ocr(self,roi,expected='.+'):
        hit=False;box=[0,0,10,10]
        if roi in ([735,286,375,58],[735,286,330,58]):hit=self.s.expanded and not self.s.query if expected=='搜索妮姬的名字' else bool(re.search(expected,self.s.query));box=[850,301,160,28]
        elif expected=='^大厅$':hit=self.s.page=='list';box=[942,1025,40,25]
        elif expected=='^妮姬$':hit=self.s.page=='hall';box=[725,1024,45,28]
        elif expected=='返回':hit=self.s.page=='detail';box=[65,1006,45,28]
        return {'hit':hit,'box':box,'detail':{'filtered':[{'text':self.s.query}] if hit and roi==[735,286,330,58] else []}}
    texts=staticmethod(lambda result:[])
class TestCollector(engine.Collector):
    def __init__(self,request,folder):super().__init__(request,folder,FakeService,FakePages,lambda:True);self.events=[];self.wait_calls=[]
    def guard(self,*_,**__):pass
    def capture(self,record=True):self.frame_captured_at=engine.time.monotonic();self.frame_size=engine.LAYOUT_SIZE
    def emit(self,kind,data=None,image=False,ignore_cancel=False):self.events.append((kind,data or {}));return {}
    def wait(self,predicate,label,**kwargs):
        self.wait_calls.append((label,kwargs))
        return super().wait(predicate,label,**kwargs)
    def wait_popup(self,timeout=20):self.wait(lambda:self.pages.page() in ('overload','non_overload','equipment_unknown'),'popup',initial=0,confirmations=1,record=False)

saved_sleep=engine.time.sleep;saved_candidates=engine.candidates
engine.time.sleep=lambda _:None
try:
    root=Path(os.environ.get('NIKKE_CACHE_DIR',project.parent/'codex temp/nikke-desktop'))/'automation-dev-copy'
    folder=Path(tempfile.mkdtemp(prefix='collection-engine-',dir=root))
    request={'characters':[roster['桃乐丝'],roster['红莲']],'target':{'hwnd':'123','pid':123},'ownerPid':1}
    test=TestCollector(request,folder)
    def items(_,details=True):
        character=roster[test.s.query]
        if test.s.query=='桃乐丝':assert not details,'Unique result must skip icon recognition'
        a={'box':[80,389,128,218],'element':character['element'],'burst':character['use_burst_skill']}
        return [a] if test.s.query=='桃乐丝' else [a,{**a,'box':[229,389,128,218]}]
    engine.candidates=items;test.run()
    assert test.state['phase']=='completed',test.state
    assert test.s.page=='hall'
    equipment=[data for kind,data in test.events if kind=='equipment'];assert len(equipment)==4,equipment
    assert equipment[0]['classification']=='unequipped';assert equipment[1]['classification']=='non_overload'
    assert [kind for kind,_ in test.events].count('character')==1
    assert [kind for kind,_ in test.events].count('skipped')==1
    assert any(kind=='done' and data['returnedToLobby'] for kind,data in test.events)
    assert not any(label=='确认list' for label,_ in test.wait_calls)
    returns=[kwargs for label,kwargs in test.wait_calls if label=='确认返回列表']
    assert len(returns)==1 and returns[0]['record'] is False and returns[0]['initial']==.15 and returns[0]['interval']==.2
    actions=[json.loads(line) for line in (folder/'actions.jsonl').read_text('utf-8').splitlines()]
    assert all('click' in event for event in actions if event['action']!='输入角色名')
    assert not any(event.get('click',{}).get('targetBox') in engine.COLLECTIBLE_TOGGLE_BOXES for event in actions)
    assert not any('升级' in str(value) or '交换' in str(value) for value in test.s.inputs)
    # Same full program with a completed checkpoint must not reread that role.
    second=TestCollector({**request,'completedCodes':[roster['桃乐丝']['nameCode']]},folder)
    def items2(_,details=True):
        c=roster[second.s.query];return [{'box':[80,389,128,218],'element':c['element'],'burst':c['use_burst_skill']},{'box':[229,389,128,218],'element':c['element'],'burst':c['use_burst_skill']}]
    engine.candidates=items2;second.run()
    assert second.state['phase']=='completed';assert not any(kind=='equipment' for kind,_ in second.events)
    # A previous run can leave an expanded search field with the old name.
    # The game’s lobby entry need not be available to resume from this list.
    class InterruptedSearchService(FakeService):
        def __init__(self,cache):
            super().__init__(cache)
            self.page='list';self.expanded=True;self.query='桃乐丝'
    run_dir=folder/'resume-from-search'
    run_dir.mkdir()
    resumed=TestCollector({**request,'completedCodes':[roster['桃乐丝']['nameCode']]},run_dir)
    resumed.service_factory=InterruptedSearchService
    with patch.object(engine,'candidates',return_value=[{'box':[80,389,128,218]}]):
        resumed.run()
    history=[json.loads(line)['action'] for line in (run_dir/'actions.jsonl').read_text('utf-8').splitlines()]
    assert history[0]=='清空搜索',history
    assert resumed.state['phase']=='completed' and resumed.s.page=='hall',resumed.state
    assert [value for kind,value,*_ in resumed.s.inputs if kind=='text']==['红莲']
    assert [data['slot'] for kind,data in resumed.events if kind=='equipment']==[slot for slot,_,_ in engine.SLOTS]
    # Transient blank frames follow submission; a later card must still be read.
    run_dir=folder/'search-results'
    run_dir.mkdir()
    names=['伊莱格：BOOM与惊吓','QUEEN（真）','桃乐丝']
    run=TestCollector({**request,'characters':[roster[name] for name in names]},run_dir)
    clock=[0.]
    polls={}
    def advance_search(seconds):
        clock[0]+=seconds
    def delayed_cards(_,details=True):
        query=run.s.query
        polls[query]=polls.get(query,0)+1
        if query=='桃乐丝' or polls[query]<=2:return []
        return [{'box':[80,389,128,218]}]
    run.delay=advance_search
    with patch.object(engine,'candidates',delayed_cards),patch.object(engine.time,'monotonic',lambda:clock[0]):
        run.run()
    completed=[data['nameCode'] for kind,data in run.events if kind=='character']
    assert completed==[roster[name]['nameCode'] for name in names[:2]],run.events
    assert [value for kind,value,*_ in run.s.inputs if kind=='text']==['伊莱格：boom与惊吓','queen（真）','桃乐丝']
    skip_index,= [i for i,(kind,_) in enumerate(run.events) if kind=='skipped']
    assert '未检测到可确认的角色卡' in run.events[skip_index][1]['reason']
    evidence={'nameCode':roster['桃乐丝']['nameCode'],'searchTerm':'桃乐丝','clientSize':[1920,1080]}
    assert run.events[skip_index-1]==('frame',{'phase':'等待搜索结果',**evidence})
    assert all(run.events[skip_index][1][key]==value for key,value in evidence.items())
    assert run.state['phase']=='completed' and run.s.page=='hall'
    # Search can return an owned variant even when it is the only visible card.
    # Load exactly the requested targets: their unselected variants still matter.
    from datetime import datetime, timezone
    targets=['白雪公主','红莲','爱德：特工兔女郎']
    selected=engine.load_collection_roster(project,[roster[name]['nameCode'] for name in targets],datetime(2026,12,3,tzinfo=timezone.utc))
    run_dir=folder/'variant-search'
    run_dir.mkdir()
    run=TestCollector({**request,'characters':selected},run_dir)
    wrong={'白雪公主':'白雪公主：纯真年代','红莲':'红莲：暗影'}
    def owned_card(_,details=True):
        card=roster[wrong.get(run.s.query,'爱德：特工兔女郎')]
        return [{'box':[80,389,128,218],'element':card['element'],'burst':card['use_burst_skill']}]
    with patch.object(engine,'candidates',owned_card):
        run.run()
    assert [data['nameCode'] for kind,data in run.events if kind=='character']==[selected[2]['nameCode']],run.events
    assert [data['nameCode'] for kind,data in run.events if kind=='skipped']==[c['nameCode'] for c in selected[:2]]
    assert run.s.selected=='爱德：特工兔女郎' and run.state['phase']=='completed'
    snow={'box':[80,389,128,218],'element':'Iron','burst':'Step3'}
    for observed in ('白雪','白雪公主：','白雪公主：纯真年代',''):
        try:engine.choose_candidate([{**snow,'name':observed}],selected[0])
        except RuntimeError:pass
        else:raise AssertionError('Shared icons or truncated name mistaken for Snow White: '+observed)
    assert engine.choose_candidate([{**snow,'name':'白雪公主'}],selected[0])[0]['name']=='白雪公主'
    assert engine.choose_candidate([{'element':'Electronic','burst':'Step3'}],selected[1])[0]['element']=='Electronic'
    class CardNamePages(FakePages):
        texts=staticmethod(engine.Pages.texts)
        def ocr(self,roi,expected='.+'):
            if roi==[114,569,94,36]:
                return {'hit':True,'box':text_box,'detail':{'filtered':[{'text':'白雪公主'}]}}
            return super().ocr(roi,expected)
    for case,text_box,should_open in [('complete-name',[120,574,72,23],True),('clipped-prefix',[119,574,89,23],False)]:
        run_dir=folder/case
        run_dir.mkdir()
        run=TestCollector({**request,'characters':selected[:1]},run_dir)
        run.pages_factory=CardNamePages
        with patch.object(engine,'candidates',side_effect=lambda *args,**kwargs:[dict(snow)]):
            run.run()
        assert run.state['phase']=='completed' and bool(run.s.selected)==should_open,(case,run.events)
    for start in ['paid_shop','department_store','outpost','ark','unknown']:
        test.s.page=start;test.s.inputs.clear()
        test.ensure('hall')
        assert len(test.s.inputs)==1 and test.s.page=='hall'
    test.s.page='unknown';test.s.inputs.clear()
    test.ensure('list')
    assert len(test.s.inputs)==2 and test.s.page=='list'
    test.s.page='unknown';test.s.inputs.clear()
    with patch.object(test.pages,'home_button_with_back',side_effect=[[149,1004,33,30],None]):
        try:test.ensure('hall')
        except engine.PageDeviation:pass
        else:raise AssertionError('Back button disappeared before dispatch on unknown page')
    assert test.s.inputs==[]
    test.s.page='paid_shop';test.s.inputs.clear()
    with patch.object(test.pages,'home_button',side_effect=[[149,1004,33,30],None]):
        try:test.ensure('hall')
        except engine.PageDeviation:pass
        else:raise AssertionError('Home button disappeared before dispatch')
    assert test.s.inputs==[]
    with patch.object(test,'wait',side_effect=engine.PageDeviation('hall unconfirmed')):
        try:test.ensure('hall')
        except engine.HomeReturnUnconfirmed:pass
        else:raise AssertionError('Expected to stop without a confirmed lobby')
    assert len(test.s.inputs)==1
    char=roster['桃乐丝']
    one_card={'box':[80,389,128,218],'element':char['element'],'burst':char['use_burst_skill']}
    for name,box,next_page in [('show-sidebar',engine.COLLECTIBLE_TOGGLE_BOXES[0],'detail'),
                               ('exit-wallpaper',engine.COLLECTIBLE_TOGGLE_BOXES[1],'detail'),
                               ('no-response',engine.COLLECTIBLE_TOGGLE_BOXES[0],'detail_wallpaper_hidden')]:
        run_dir=folder/name
        run_dir.mkdir()
        run=TestCollector({**request,'characters':[char]},run_dir)
        clock=[0.]
        def advance(seconds):
            clock[0]+=seconds
        run.delay=advance
        with patch.object(engine,'candidates',return_value=[one_card]), \
             patch.object(FakeService,'card_destination','detail_wallpaper_hidden'), \
             patch.object(FakeService,'after_wallpaper',next_page), \
             patch.object(engine.time,'monotonic',lambda:clock[0]), \
             patch.object(engine.random.SystemRandom,'choice',lambda self,options:box if options==engine.COLLECTIBLE_TOGGLE_BOXES else False):
            run.run()
        history=[json.loads(line) for line in (run_dir/'actions.jsonl').read_text('utf-8').splitlines()]
        toggles=[event for event in history if event.get('click',{}).get('targetBox') in engine.COLLECTIBLE_TOGGLE_BOXES]
        assert len(toggles)==1 and toggles[0]['click']['targetBox']==box,(name,history)
        assert sum(event['action']=='打开目标角色' for event in history)==1
        slots=[evt['slot'] for kind,evt in run.events if kind=='equipment']
        if next_page=='detail':
            assert run.state['phase']=='completed' and slots==[slot for slot,_,_ in engine.SLOTS],(name,run.state,slots)
        else:
            assert run.state['phase']=='failed' and not slots and history[-1]==toggles[0],(name,run.state,history)
            assert '未确认装备栏' in run.state['error']
    print(json.dumps({'passed':True,'fullAutomaticFlow':True,'skipAmbiguous':True,'nonT10':True,'unequipped':True,'returnedHall':True,'resumeNoDuplicate':True,'noDuplicateListVerification':True,'shortBoundedReturnPoll':True,'clickCoordinatesLogged':True,'wallpaperBothExits':True,'wallpaperTimeoutStopsAfterOneClick':True,'gameInputs':0,'evidence':str(folder)}))
finally:engine.time.sleep=saved_sleep;engine.candidates=saved_candidates

import hashlib,json,pathlib,yaml
root=pathlib.Path('/workspace/scratch/b65d6a995417/review948-independent-oct27')
manifest=json.loads((root/'manifest.json').read_text())
for entry in manifest:
 p=root/entry['path']; b=p.read_bytes()
 def sha(b):return hashlib.sha1(b'blob '+str(len(b)).encode()+b'\0'+b).hexdigest()
 if sha(b)!=entry['sha'] and b.endswith(b'\n') and sha(b[:-1])==entry['sha']:p.write_bytes(b[:-1]);b=b[:-1]
 assert sha(b)==entry['sha'],entry['path']
print('6 canonical source blobs SHA1 verified')
read=lambda n:(root/'.github/workflows'/f'{n}.yml').read_text()
doc=lambda n:yaml.load(read(n),Loader=yaml.BaseLoader)
c=doc('orchid-continuous-completion');a=doc('orchid-no-api-scheduler');w=doc('orchid-budgeted-completion-lane');l=doc('orchid-completion-lane');d=doc('orchid-deterministic-dispatch')
assert 'schedule' not in c['on'] and 'schedule' not in a['on']
assert set(c['on'])=={'pull_request','issues','workflow_dispatch','workflow_call'}
assert c['on']['pull_request']['types']==['opened','reopened','synchronize','ready_for_review','closed']
assert c['on']['issues']['types']==['closed','reopened','labeled','unlabeled']
assert 'Scheduled launches paused pending recovery from runner nonexecution.' in read('orchid-continuous-completion')
assert a['jobs']['canonical']['uses']=='./.github/workflows/orchid-continuous-completion.yml'
print('PASS pause, admission and alias YAML semantics')
for name in ('dispatch','audit'):
 assert "github.event_name != 'pull_request'" in c['jobs'][name]['if']
assert 'scripts/oc-dispatch-runtime.ts plan' in read('orchid-continuous-completion')
print('PASS PR plan-only dispatch/audit guard retained')
for flow in (w,l):
 assert flow['on']['workflow_call']['inputs']['provider_authorized']['default']=='false'
 for job in flow['jobs'].values():
  env=job.get('env',{})
  if 'OC_PROVIDER_DAILY_MAX_CALLS' in env:
   assert env['OC_PROVIDER_DAILY_MAX_CALLS']=='4' and env['OC_PROVIDER_WAVE_MAX_CALLS']=='1'
for term in ('inputs.provider_authorized',"needs.budget-preflight.outputs.allowed == 'true'","needs.budget-preflight.outputs.lease_id != ''"):
 assert term in w['jobs']['provider-worker']['if']
assert "inputs.provider_authorized && needs.budget-authorization.outputs.allowed == 'true'"==l['jobs']['execute']['if']
print('PASS explicit authorization, budget and fenced lease gates retained')
assert w['jobs']['provider-free-worker']['needs']==['classify','deterministic-preflight']
assert w['jobs']['deterministic-preflight']['if']=="needs.classify.outputs.provider_free == 'true'"
assert 'secrets' not in w['jobs']['provider-free-worker']
assert d['jobs']['lane']['with']['provider_authorized']=='true'
print('PASS deterministic lane remains separate from governed provider lane')
assert 'scripts/oc-dispatch-runtime.ts audit' in read('orchid-continuous-completion')
assert 'if-no-files-found: error' in read('orchid-budgeted-completion-lane')
print('PASS plan and per-issue receipt evidence requirements retained')

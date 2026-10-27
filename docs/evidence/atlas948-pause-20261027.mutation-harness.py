import pathlib,tempfile,shutil,os,subprocess,json,hashlib
root=pathlib.Path('/workspace/scratch/b65d6a995417/cycle24/combined')
test='src/lib/provider-governor/noApiSchedulerWorkflow.test.ts'
workflow='orchid-continuous-completion.yml'
original=(root/'.github/workflows'/workflow).read_text()
variants={
 'baseline':original,
 'timer_restored':original.replace('on:\n','on:\n  schedule:\n    - cron: "2/5 * * * *"\n',1),
 'pause_marker_removed':original.replace('Scheduled launches paused pending recovery from runner nonexecution.','Timer status undocumented.'),
 'manual_trigger_removed':original.replace('  workflow_dispatch:\n','',1),
 'issue_admission_removed':original.replace('  issues:\n    types: [closed, reopened, labeled, unlabeled]\n','',1),
}
out=[]
for name,text in variants.items():
 with tempfile.TemporaryDirectory(prefix='orchid-pause-contract-') as temp:
  p=pathlib.Path(temp);(p/'.github/workflows').mkdir(parents=True);(p/pathlib.Path(test).parent).mkdir(parents=True)
  shutil.copy2(root/test,p/test)
  for f in ['orchid-continuous-completion','orchid-no-api-scheduler','orchid-budgeted-completion-lane','orchid-completion-lane','orchid-deterministic-dispatch']:
   shutil.copy2(root/'.github/workflows'/f'{f}.yml',p/'.github/workflows'/f'{f}.yml')
  (p/'.github/workflows'/workflow).write_text(text)
  (p/'node_modules').symlink_to((root/'node_modules').resolve(),target_is_directory=True)
  env={'PATH':os.environ['PATH'],'NO_API_MODE':'true','PROVIDER_AUTHORIZED':'false','NODE_OPTIONS':'--require=/workspace/scratch/b65d6a995417/cycle24/fence.cjs','npm_config_offline':'true'}
  result=subprocess.run(['node',str(root/'node_modules/vitest/vitest.mjs'),'run',test,'--pool=forks','--maxWorkers=1','--minWorkers=1'],cwd=p,env=env,capture_output=True,text=True)
  log=result.stdout+result.stderr
  pathlib.Path(f'/workspace/scratch/b65d6a995417/cycle29/mutation-{name}.log').write_text(log)
  if name=='baseline':assert result.returncode==0 and '5 passed' in log,log
  else:assert result.returncode==1 and '1 failed | 4 passed' in log and 'AssertionError' in log,log
  out.append({'fixture':name,'exit_code':result.returncode,'expected_rejection':name!='baseline','actual_test_source_sha1':hashlib.sha1((p/test).read_bytes()).hexdigest(),'log_sha256':hashlib.sha256(log.encode()).hexdigest()})
print(json.dumps(out,indent=2))

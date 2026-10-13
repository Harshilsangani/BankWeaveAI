"""Read-only G01 checks. Never enable APIs, change IAM, provision or print tokens."""
import argparse
from concurrent.futures import ThreadPoolExecutor
import json
import subprocess
import sys


def inspect(arguments):
    try:
        process = subprocess.run(['gcloud', *arguments, '--format=json', '--quiet'],
                                 capture_output=True, text=True, timeout=45)
    except (OSError, subprocess.TimeoutExpired):
        return dict(status='blocked', reason='gcloud is unavailable or the request timed out.')
    if process.returncode:
        if 'ACCESS_TOKEN_SCOPE_INSUFFICIENT' in process.stderr or 'insufficient authentication scopes' in process.stderr:
            reason = 'The current credential has insufficient OAuth scopes.'
        elif 'PERMISSION_DENIED' in process.stderr or 'does not have permission' in process.stderr:
            reason = 'The current identity lacks the required read permission.'
        else:
            reason = 'The cloud read failed; inspect it with an authorized gcloud account.'
        return dict(status='blocked', reason=reason)
    try:
        return dict(status='checked', data=json.loads(process.stdout))
    except json.JSONDecodeError:
        return dict(status='blocked', reason='gcloud did not return the expected JSON response.')


def run(project, instance, zone):
    requests = {
        'services': ['services', 'list', '--enabled', '--project=' + project],
        'billing': ['billing', 'projects', 'describe', project],
        'project': ['projects', 'describe', project],
    }
    if instance:
        requests['vm'] = ['compute', 'instances', 'describe', instance,
                          '--zone=' + zone, '--project=' + project]
    with ThreadPoolExecutor(max_workers=len(requests)) as pool:
        futures = {name: pool.submit(inspect, arguments) for name, arguments in requests.items()}
        raw = {name: future.result() for name, future in futures.items()}
    checks = {}
    for name, result in raw.items():
        if result['status'] != 'checked':
            checks[name] = result
            continue
        data = result['data']
        if name == 'services':
            enabled = {row['config']['name'] for row in data}
            checks[name] = dict(status='checked', computeEnabled='compute.googleapis.com' in enabled,
                               vertexEnabled='aiplatform.googleapis.com' in enabled,
                               enabledServices=sorted(enabled))
        elif name == 'billing':
            checks[name] = dict(status='checked', billingEnabled=data.get('billingEnabled', False))
        elif name == 'project':
            checks[name] = dict(status='checked', projectNumber=data.get('projectNumber'),
                               lifecycleState=data.get('lifecycleState'))
        else:
            identities = [dict(email=account.get('email'), scopes=account.get('scopes', []))
                          for account in data.get('serviceAccounts', [])]
            checks[name] = dict(status='checked', name=data.get('name'), statusOfVM=data.get('status'),
                               machineType=data.get('machineType', '').rsplit('/', 1)[-1],
                               zone=data.get('zone', '').rsplit('/', 1)[-1], serviceAccounts=identities)

    blocked = any(value['status'] == 'blocked' for value in checks.values())
    return dict(project=project, cloudReadsComplete=not blocked, g01Complete=False, checks=checks,
                remaining=['Verify actual credit grant, expiry and eligible SKUs in Billing.',
                           'Review IAM grants for the chosen runtime service identity.',
                           'Inspect project budget filters/alerts and set approved cost limits.',
                           'Validate the chosen model/location and workload credentials before activation.'],
                boundary='Read-only inventory. Billing enabled is not proof of available credits or a budget. No cloud settings or resources were changed.')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--project', required=True)
    parser.add_argument('--instance')
    parser.add_argument('--zone')
    arguments = parser.parse_args()
    if bool(arguments.instance) != bool(arguments.zone):
        parser.error('--instance and --zone must be supplied together')
    result = run(arguments.project, arguments.instance, arguments.zone)
    print(json.dumps(result, indent=2))
    sys.exit(0 if result['cloudReadsComplete'] else 1)

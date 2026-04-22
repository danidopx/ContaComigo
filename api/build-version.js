import pkg from '../package.json' with { type: 'json' };

const version = pkg?.version || '0.0.0';

function definirCors(res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

export default function handler(req, res) {
    definirCors(res);
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    if (req.method === 'OPTIONS') {
        return res.status(204).end();
    }

    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const renderService = String(process.env.RENDER_SERVICE_NAME || '').trim();
    const renderExternalUrl = String(process.env.RENDER_EXTERNAL_URL || '').trim();
    const renderGitCommit = String(process.env.RENDER_GIT_COMMIT || '').trim();
    const renderGitBranch = String(process.env.RENDER_GIT_BRANCH || '').trim();

    const environmentName = renderExternalUrl ? 'production' : 'preview';
    const commitSha = renderGitCommit;
    const commitRef = renderGitBranch;
    const deploymentUrl = renderExternalUrl;

    return res.status(200).json({
        environment_name: environmentName,
        current_version: version,
        commit_ref: commitSha,
        branch_name: commitRef,
        deployment_url: deploymentUrl ? `${deploymentUrl.startsWith('http') ? deploymentUrl : `https://${deploymentUrl.replace(/^https?:\/\//i, '')}`}` : '',
        source: renderService ? 'runtime_render' : 'runtime_build'
    });
}

import pkg from '../package.json' with { type: 'json' };
import { SUPABASE_SERVICE_ROLE_KEY, dbSelect } from './_lib.js';

const version = pkg?.version || '0.0.0';

function definirCors(res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

async function getCurrentVersion(environmentName) {
    if (!SUPABASE_SERVICE_ROLE_KEY) {
        return null;
    }

    const [current] = await dbSelect('app_versions', {
        select: 'current_version,environment_name,commit_ref,deployment_url,source,release_date',
        environment_name: `eq.${environmentName}`,
        is_current: 'eq.true',
        order: 'release_date.desc',
        limit: '1'
    });

    return current || null;
}

export default async function handler(req, res) {
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
    const deploymentUrlNormalized = deploymentUrl
        ? `${deploymentUrl.startsWith('http') ? deploymentUrl : `https://${deploymentUrl.replace(/^https?:\/\//i, '')}`}`
        : '';

    let currentVersion = version;
    let versionSource = renderService ? 'runtime_render' : 'runtime_build';

    try {
        const persistedVersion = await getCurrentVersion(environmentName);
        if (persistedVersion?.current_version) {
            currentVersion = persistedVersion.current_version;
            versionSource = persistedVersion.source || 'database';
        }
    } catch {
        // Keep package.json fallback when the database is temporarily unavailable.
    }

    return res.status(200).json({
        environment_name: environmentName,
        current_version: currentVersion,
        commit_ref: commitSha,
        branch_name: commitRef,
        deployment_url: deploymentUrlNormalized,
        source: versionSource
    });
}

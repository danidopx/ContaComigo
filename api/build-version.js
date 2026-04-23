import pkg from '../package.json' with { type: 'json' };
import { SUPABASE_SERVICE_ROLE_KEY, dbInsert, dbPatch, dbSelect } from './_lib.js';

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

function normalizeVersion(value) {
    return String(value || version).trim().replace(/\+.*/, '').replace(/-build\.\d+$/i, '') || version;
}

function incrementPatchVersion(value) {
    const [major, minor, patch] = normalizeVersion(value).split('.').map(part => Number.parseInt(part, 10) || 0);
    return `${major}.${minor}.${patch + 1}`;
}

async function ensureCurrentVersion({
    environmentName,
    commitSha,
    deploymentUrl,
    source,
    currentVersion
}) {
    if (!SUPABASE_SERVICE_ROLE_KEY) {
        return null;
    }

    const [latestVersion] = await dbSelect('app_versions', {
        select: 'id,current_version,commit_ref',
        environment_name: `eq.${environmentName}`,
        order: 'release_date.desc',
        limit: '1'
    });

    const [existingByCommit] = await dbSelect('app_versions', {
        select: 'id,current_version,source',
        environment_name: `eq.${environmentName}`,
        commit_ref: `eq.${commitSha}`,
        order: 'release_date.desc',
        limit: '1'
    });

    await dbPatch('app_versions', {
        environment_name: `eq.${environmentName}`,
        is_current: 'eq.true',
        commit_ref: `neq.${commitSha}`
    }, {
        is_current: false
    }, 'return=minimal');

    if (existingByCommit?.id) {
        const normalizedCurrentVersion = normalizeVersion(existingByCommit.current_version);
        const [updated] = await dbPatch('app_versions', {
            id: `eq.${existingByCommit.id}`
        }, {
            current_version: normalizedCurrentVersion,
            deployment_url: deploymentUrl,
            source,
            is_current: true,
            is_public: true,
            updated_at: new Date().toISOString()
        });
        return updated || null;
    }

    const nextVersion = latestVersion?.current_version
        ? incrementPatchVersion(latestVersion.current_version)
        : normalizeVersion(currentVersion);

    const [inserted] = await dbInsert('app_versions', [{
        app_name: 'ContaComigo',
        environment_name: environmentName,
        current_version: nextVersion,
        previous_version: latestVersion?.current_version || null,
        release_date: new Date().toISOString(),
        responsible_name: 'render-runtime',
        deployment_url: deploymentUrl,
        commit_ref: commitSha || null,
        release_notes: 'Registro automatico em runtime',
        source,
        is_current: true,
        is_public: true
    }]);

    return inserted || null;
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

    let currentVersion = normalizeVersion(version);
    let versionSource = renderService ? 'runtime_render' : 'runtime_build';
    let syncStatus = SUPABASE_SERVICE_ROLE_KEY ? 'pending' : 'service_role_missing';
    let syncError = '';

    try {
        const persistedVersion = await getCurrentVersion(environmentName);
        if (persistedVersion?.current_version) {
            currentVersion = normalizeVersion(persistedVersion.current_version);
            versionSource = persistedVersion.source || 'database';
            syncStatus = 'loaded_from_database';
        } else if (commitSha) {
            const ensuredVersion = await ensureCurrentVersion({
                environmentName,
                commitSha,
                deploymentUrl: deploymentUrlNormalized,
                source: versionSource,
                currentVersion
            });
            if (ensuredVersion?.current_version) {
                currentVersion = ensuredVersion.current_version;
                versionSource = ensuredVersion.source || versionSource;
                syncStatus = 'registered_in_database';
            } else {
                syncStatus = 'database_write_skipped';
            }
        }
    } catch (error) {
        syncStatus = 'database_error';
        syncError = error?.message || 'unknown_error';
        console.error('[build-version] failed to sync app_versions:', error);
    }

    return res.status(200).json({
        environment_name: environmentName,
        current_version: currentVersion,
        commit_ref: commitSha,
        branch_name: commitRef,
        deployment_url: deploymentUrlNormalized,
        source: versionSource,
        version_sync_status: syncStatus,
        version_sync_error: syncError
    });
}

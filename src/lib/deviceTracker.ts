import { doc, updateDoc, Timestamp } from 'firebase/firestore';
import { db } from './firebase';

interface DeviceInfo {
    browser: string;
    os: string;
    device_type: 'Desktop' | 'Mobile' | 'Tablet';
    device_model: string | null;
}

interface LocationInfo {
    country: string;
    city: string | null;
}

/**
 * Parse User Agent para extrair informações do dispositivo
 */
function parseUserAgent(): DeviceInfo {
    const ua = navigator.userAgent;

    // Detectar Browser
    let browser = 'Unknown';
    if (ua.includes('Chrome') && !ua.includes('Edg')) {
        const match = ua.match(/Chrome\/(\d+)/);
        browser = `Chrome ${match?.[1] || ''}`;
    } else if (ua.includes('Safari') && !ua.includes('Chrome')) {
        const match = ua.match(/Version\/(\d+)/);
        browser = `Safari ${match?.[1] || ''}`;
    } else if (ua.includes('Firefox')) {
        const match = ua.match(/Firefox\/(\d+)/);
        browser = `Firefox ${match?.[1] || ''}`;
    } else if (ua.includes('Edg')) {
        const match = ua.match(/Edg\/(\d+)/);
        browser = `Edge ${match?.[1] || ''}`;
    }

    // Detectar OS
    let os = 'Unknown';
    if (ua.includes('Windows NT 10')) os = 'Windows 10';
    else if (ua.includes('Windows NT 11')) os = 'Windows 11';
    else if (ua.includes('Mac OS X')) {
        const match = ua.match(/Mac OS X (\d+[._]\d+)/);
        os = `macOS ${match?.[1]?.replace('_', '.') || ''}`;
    }
    else if (ua.includes('iPhone')) os = 'iOS';
    else if (ua.includes('iPad')) os = 'iPadOS';
    else if (ua.includes('Android')) os = 'Android';
    else if (ua.includes('Linux')) os = 'Linux';

    // Detectar tipo e modelo
    let device_type: DeviceInfo['device_type'] = 'Desktop';
    let device_model: string | null = null;

    if (/iPhone/.test(ua)) {
        device_type = 'Mobile';
        device_model = 'iPhone';
    } else if (/iPad/.test(ua)) {
        device_type = 'Tablet';
        device_model = 'iPad';
    } else if (/Android/.test(ua)) {
        device_type = /Mobile/.test(ua) ? 'Mobile' : 'Tablet';
    }

    return { browser, os, device_type, device_model };
}

/**
 * Buscar geolocalização aproximada (apenas país/cidade, SEM armazenar IP)
 * 
 * NOTA: API ipapi.co bloqueada por CORS em ambiente de desenvolvimento local.
 * Em produção, considerar usar uma Cloud Function como proxy ou API alternativa.
 */
async function fetchLocation(): Promise<LocationInfo | null> {
    // Temporariamente desabilitado devido a CORS em desenvolvimento
    // Em produção, usar Cloud Function como proxy ou API CORS-friendly
    return null;

    /* Original code (bloqueado por CORS):
    try {
      const response = await fetch('https://ipapi.co/json/');
      if (response.ok) {
        const data = await response.json();
        return {
          country: data.country_name || 'Desconhecido',
          city: data.city || null,
        };
      }
      return null;
    } catch (error) {
      console.warn('[DeviceTracker] Erro ao buscar geolocalização:', error);
      return null;
    }
    */
}

/**
 * Atualizar último acesso e informações de dispositivo do usuário
 */
export async function updateLastAccess(userId: string) {
    try {
        const deviceInfo = parseUserAgent();
        const locationInfo = await fetchLocation();

        const userRef = doc(db, 'user_profiles', userId);
        await updateDoc(userRef, {
            last_access_at: Timestamp.now(),
            device_info: deviceInfo,
            location_info: locationInfo,
        });

        console.log('[DeviceTracker] Atualizado:', userId, deviceInfo.browser, deviceInfo.os);
    } catch (error) {
        console.error('[DeviceTracker] Erro ao atualizar:', error);
    }
}

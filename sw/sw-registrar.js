
// Service Worker registration utility
export class SWRegistrar {
  constructor() {
    this.registeredSWs = new Set();
  }

  async registerSW(swURLOrBlob, scope = '/') {
    if (!('serviceWorker' in navigator)) {
      throw new Error('Service Workers not supported');
    }

    try {
      // Handle both URL and Blob registration
      const registration = await navigator.serviceWorker.register(swURLOrBlob, { scope });
      
      // Wait for activation
      if (registration.active) {
        await registration.update();
      } else if (registration.installing) {
        await new Promise((resolve, reject) => {
          const worker = registration.installing;
          worker.addEventListener('statechange', () => {
            if (worker.state === 'activated') {
              resolve();
            } else if (worker.state === 'redundant') {
              reject(new Error('Service Worker installation failed'));
            }
          });
        });
      }

      this.registeredSWs.add(registration);
      console.log(`[SW-Registrar] Registered with scope: ${scope}`);
      
      return registration;
    } catch (error) {
      console.error('[SW-Registrar] Registration failed:', error);
      
      // Provide helpful error messages for common issues
      if (error.name === 'SecurityError') {
        throw new Error('SSL required for Service Workers. Use HTTPS or localhost.');
      } else if (error.name === 'TypeError' && swURLOrBlob instanceof Blob) {
        throw new Error('Blob registration may be blocked by browser policy. Try hosted SW file.');
      }
      
      throw error;
    }
  }

  async unregisterAll() {
    const unregisterPromises = Array.from(this.registeredSWs).map(registration => 
      registration.unregister().then(success => {
        console.log(`[SW-Registrar] Unregistered: ${success}`);
        return success;
      })
    );

    await Promise.all(unregisterPromises);
    this.registeredSWs.clear();
  }

  async getRegistrations() {
    return await navigator.serviceWorker.getRegistrations();
  }

  async forceUpdate() {
    const registrations = await this.getRegistrations();
    await Promise.all(registrations.map(reg => reg.update()));
  }
}
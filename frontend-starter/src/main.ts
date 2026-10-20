import { bootstrapApplication } from "@angular/platform-browser";
import { provideHttpClient, withInterceptors, withXhr } from "@angular/common/http";
import { provideRouter } from "@angular/router";
import { AppComponent } from './app/components/app/app';
import { routes } from './app/routes';
import { authInterceptor } from './app/shared/interceptors/auth.interceptor';

bootstrapApplication(AppComponent, {
  providers: [
    provideRouter(routes),
    // XHR instead of the default fetch backend: fetch cannot report upload progress.
    provideHttpClient(withXhr(), withInterceptors([authInterceptor])),
  ],
}).catch(console.error);

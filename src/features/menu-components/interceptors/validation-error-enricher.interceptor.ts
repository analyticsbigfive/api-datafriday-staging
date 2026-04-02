import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  BadRequestException,
} from '@nestjs/common';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';

/**
 * Intercepteur qui enrichit les erreurs de validation avec les données réelles
 * pour fournir des messages d'erreur plus précis et contextuels.
 */
@Injectable()
export class ValidationErrorEnricherInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    return next.handle().pipe(
      catchError((error) => {
        if (error instanceof BadRequestException) {
          const response = error.getResponse() as any;
          
          // Si c'est une erreur de validation avec des erreurs détaillées
          if (response.errors && Array.isArray(response.errors)) {
            const request = context.switchToHttp().getRequest();
            const body = request.body;
            
            // Enrichir chaque erreur avec les données réelles
            response.errors = response.errors.map((err: any) => {
              const enrichedError = { ...err };
              
              // Extraire le chemin de la propriété (ex: "children.0.childId" -> ["children", "0", "childId"])
              const propertyPath = err.property.split('.');
              
              // Naviguer dans le body pour trouver l'objet concerné
              let targetObject = body;
              let parentObject = null;
              let arrayIndex = -1;
              
              for (let i = 0; i < propertyPath.length - 1; i++) {
                const key = propertyPath[i];
                if (targetObject && targetObject[key] !== undefined) {
                  parentObject = targetObject;
                  targetObject = targetObject[key];
                  
                  // Si c'est un index de tableau, le stocker
                  if (!isNaN(parseInt(key))) {
                    arrayIndex = parseInt(key);
                  }
                }
              }
              
              // Construire un message contextuel
              let contextInfo = '';
              
              if (targetObject && typeof targetObject === 'object') {
                // Déterminer le type de relation
                const isChildRelation = propertyPath[0] === 'children';
                const isIngredientRelation = propertyPath[0] === 'ingredients';
                
                if (isChildRelation) {
                  const name = targetObject.name || targetObject.itemName || targetObject.childName || 'Inconnu';
                  const id = targetObject.childId || targetObject.id || 'N/A';
                  contextInfo = `\n📦 SOUS-COMPOSANT #${arrayIndex + 1}: "${name}" (ID: ${id})`;
                  
                  // Afficher toutes les propriétés disponibles pour debug
                  const availableProps = Object.keys(targetObject).filter(k => !k.startsWith('_'));
                  contextInfo += `\n   Propriétés disponibles: ${availableProps.join(', ')}`;
                  contextInfo += `\n   Données complètes: ${JSON.stringify(targetObject, null, 2)}`;
                } else if (isIngredientRelation) {
                  const name = targetObject.name || targetObject.itemName || targetObject.ingredientName || 'Inconnu';
                  const id = targetObject.ingredientId || targetObject.marketPriceId || targetObject.id || 'N/A';
                  contextInfo = `\n🥬 INGRÉDIENT #${arrayIndex + 1}: "${name}" (ID: ${id})`;
                  
                  // Afficher toutes les propriétés disponibles pour debug
                  const availableProps = Object.keys(targetObject).filter(k => !k.startsWith('_'));
                  contextInfo += `\n   Propriétés disponibles: ${availableProps.join(', ')}`;
                  contextInfo += `\n   Données complètes: ${JSON.stringify(targetObject, null, 2)}`;
                }
              }
              
              // Enrichir les messages de contraintes
              if (enrichedError.constraints) {
                Object.keys(enrichedError.constraints).forEach(key => {
                  enrichedError.constraints[key] = contextInfo + '\n' + enrichedError.constraints[key];
                });
              }
              
              // Enrichir les messages
              if (enrichedError.messages) {
                enrichedError.messages = enrichedError.messages.map((msg: string) => contextInfo + '\n' + msg);
              }
              
              return enrichedError;
            });
          }
        }
        
        return throwError(() => error);
      }),
    );
  }
}

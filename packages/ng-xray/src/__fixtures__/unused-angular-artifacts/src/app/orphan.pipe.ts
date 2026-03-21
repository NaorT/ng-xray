import { Pipe, PipeTransform } from '@angular/core';

@Pipe({ name: 'orphan', standalone: true })
export class OrphanPipe implements PipeTransform {
  transform(value: string): string {
    return value.toUpperCase();
  }
}

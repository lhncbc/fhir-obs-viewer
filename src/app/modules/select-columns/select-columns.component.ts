import { Component, Inject, OnInit } from '@angular/core';
import { ColumnDescription } from '../../types/column.description';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';

/**
 * Component for selecting columns displayed in resource table
 */
@Component({
  selector: 'app-select-columns',
  templateUrl: './select-columns.component.html',
  styleUrls: ['./select-columns.component.less']
})
export class SelectColumnsComponent implements OnInit {
  resourceType: string;
  columns: ColumnDescription[] = [];
  wrapCellText: boolean;

  constructor(
    private dialogRef: MatDialogRef<SelectColumnsComponent>,
    @Inject(MAT_DIALOG_DATA) data
  ) {
    this.resourceType = data.resourceType;
    this.columns = data.columns;
    this.wrapCellText = data.wrapCellText;
  }

  ngOnInit(): void {}

  close(): void {
    this.dialogRef.close();
  }

  save(): void {
    this.dialogRef.close({
      columns: this.columns,
      wrapCellText: this.wrapCellText
    });
  }

  clearSelection(): void {
    this.columns.forEach((x) => (x.visible = false));
  }
}
